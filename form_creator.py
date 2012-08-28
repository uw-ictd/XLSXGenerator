"""
form_creator.py take an XLSForm (or rather something similar for the time being)
and uses it to create a JSON template and form image for use with ODK Scan.
"""
import json, codecs, sys, os, re
import xlsform2

#TODO: add aliases for types and choice values to standard XLSForms work
#TODO: make the layout more "dynamic" (i.e. make bigger segments when there are more choices)

def choices2items(choice_list,
                  segment,
                  item_width = 20,
                  item_label_width = 0,
                  item_height = 20,
                  row_one_left_margin = 400,
                  base_margin = 20,
                  ):
    if len(choice_list) > 3:
        row_one_left_margin = 999999 #skip the first row
    left_margin = row_one_left_margin
    y_offset = 0
    out_choice_list = []
    while len(choice_list) > 0:
        y_offset += item_height
        segment['segment_height'] = y_offset + item_height
        for x in range(segment['segment_x'] + left_margin + item_label_width,
                       segment['segment_width'] - base_margin,
                       item_width + item_label_width):
            if len(choice_list) == 0: return out_choice_list
            choice = choice_list.pop()
            choice.update({
                  "item_x": x,
                  "item_y": y_offset
            })
            out_choice_list.append(choice)
        left_margin = base_margin
    return out_choice_list

select_regexp = re.compile(r"^(?P<select_type>("
                       + 'select(1)?'
                       + r")) (?P<list_name>\S+)( (?P<specify_other>(or specify other|or_other|or other)))?$",
                       flags=re.IGNORECASE)
tally_regexp = re.compile(r"^tally( )?(?P<amount>\d*)$", flags=re.IGNORECASE)
begin_block_regex = re.compile(r"^begin\s(?P<blocktype>\w+)$", flags=re.IGNORECASE)
end_block_regex = re.compile(r"^end\s(?P<blocktype>\w+)$", flags=re.IGNORECASE)

def make_field_json(field, segment, choice_lists):
    field_type = field['type']
    select_parse = select_regexp.search(field_type)
    tally_parse = tally_regexp.search(field_type)
    if select_parse:
        parse_dict = select_parse.groupdict()
        select_type = parse_dict.get("select_type")
        if select_type:
            field['type'] = select_type
            list_name = parse_dict["list_name"]
            if list_name not in choice_lists:
                raise Exception("List name not in choices sheet: " +
                                list_name +
                                " Error on row: " +
                                str(row_number))
            field['items'] = choices2items(choice_lists[list_name],
                                           segment,
                                           item_label_width=70)
    elif tally_parse:
        parse_dict = tally_parse.groupdict()
        amount_str = parse_dict.get("amount")
        amount = 40
        try:
            amount = int(amount_str)
        except:
            pass
        field['type'] = 'int'
        field['items'] = choices2items([{} for x in range(amount)],
                                       segment)
    elif field_type == "string":
        min_height = field.get('min_height', segment['segment_height'])
        if min_height > segment['segment_height']:
            segment['segment_height'] = min_height
    elif field_type == "int":
        pass
    else:
        pass
    field['segments'] = [segment]
    return field

def make_json_template(xlsform_obj,
                       height = 1076, #Using letter height
                       width = 832,
                       y_initial_offset=100,
                       margin_y = 10,
                       margin_x = 40,
                       ):
    """
    Create a json template from the xlsform json
    by adding location information to the fields.
    """
    form_title = xlsform_obj.get('settings', {})[0].get('form_title', '')
    y_offset = y_initial_offset
    choice_lists = xlsform_obj['choices']
    fields = []
    for field in xlsform_obj['survey']:
        if field['type'] in ['group', 'block']:
            idx = 0
            segment_width = (width - margin_x * 2) / len(field['prompts'])
            segments = []
            for field in field['prompts']:
                segment = {
                  "segment_x": margin_x + idx * segment_width,
                  "segment_y": y_offset,
                  "segment_width": segment_width,
                  "segment_height": 30 #Height is not static
                }
                segments.append(segment)
                field_json = make_field_json(field, segment, choice_lists)
                fields.append(field_json)
                idx += 1
            max_segment_height = 0
            for segment in segments:
                if segment['segment_height'] > max_segment_height:
                    max_segment_height = segment['segment_height']
            for segment in segments:
                segment['segment_height'] = max_segment_height
            y_offset += max_segment_height
        else:
            segment = {
              "segment_x": margin_x,
              "segment_y": y_offset,
              "segment_width": width - margin_x * 2,
              "segment_height": 30 #Height is not static
            }
            field_json = make_field_json(field, segment, choice_lists)
            if not field_json:
                continue
            fields.append(field_json)
            y_offset += segment['segment_height']

    return {
                "form_title": form_title,
                "height": height,
                "width": width,
                "fields": fields,
                "classifier": {
                        "classification_map": {
                             "empty": False
                        },
                        "default_classification": True,
                        "training_data_uri": "bubbles",
                        "classifier_height": 18,
                        "classifier_width": 16,
                        "advanced": {
                             "alignment_radius": 2.0,
                             "flip_training_data": True
                        }
                }
            }
    
def create_form(path_or_file, output_path):
    fp = codecs.open(output_path, mode="w", encoding="utf-8")
    xlsform_obj = xlsform2.process_spreadsheet(path_or_file)
    json.dump(make_json_template(xlsform_obj), fp=fp, ensure_ascii=False, indent=4)
    fp.close()
    
    
if __name__ == "__main__":
    argv = sys.argv
    #For debugging
    argv = [
            sys.argv[0],
            os.path.join(os.path.dirname(__file__), "test.xls"),
            os.path.join(os.path.dirname(__file__), "test.html"),
    ]
    if len(argv) < 3:
        print __doc__
        print 'Usage:'
        print argv[0] + ' path_to_XLSForm output_path'
    else:
        create_form(argv[1], argv[2])
        print 'Conversion complete!'
