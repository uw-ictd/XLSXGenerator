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
    if segment['segment_width'] - 2 * base_margin < item_width + item_label_width:
        raise Exception('Cannot fit choices in segment. Do you have a group more than 5 questions?')
    while len(choice_list) > 0:
        y_offset += item_height
        segment['segment_height'] = y_offset + item_height
        x_coords = range(left_margin + item_label_width,
                       segment['segment_width'] - base_margin,
                       item_width + item_label_width)
        for x in x_coords:
            if len(choice_list) == 0: return out_choice_list
            choice = choice_list.pop(0)
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
                       form_height = 1076, #Using letter height
                       form_width = 832,
                       margin_y = 100,
                       margin_x = 40,
                       ):
    """
    Create a json template from the xlsform json
    by adding location information to the fields.
    """
    output = {
        "height": form_height,
        "width": form_width,
        "classifier": {
                "classification_map": {
                     "empty": False
                },
                "default_classification": True,
                "training_data_uri": "bubbles",
                "classifier_height": 20,
                "classifier_width": 18,
                "advanced": {
                     "alignment_radius": 4.0,
                     "flip_training_data": True
                }
        }
    }
    output.update(xlsform_obj.get('settings', {})[0])
    choice_lists = xlsform_obj['choices']
    
    def generate_fields(in_fields, segment):
        fields = []
        for field in in_fields:
            if field['type'] in ['group', 'block']:
                idx = 0
                col_width = float(segment["segment_width"]) / len(field['prompts'])
                col_segments = []
                for field in field['prompts']:
                    col_segment = {
                      "segment_x": int(segment['segment_x'] + round(idx * col_width)),
                      "segment_y": segment["segment_y"],
                      "segment_width": int(round(col_width)),
                      "segment_height": 30, #default height is not static
                      "row_segments" : []
                    }
                    col_segments.append(col_segment)
                    if field['type'] in ['group', 'block']:
                        row_fields = generate_fields(field['prompts'], col_segment)
                        fields += row_fields
                        col_segment["row_segments"] = [ f['segments'][0] for f in row_fields ]
                    else:
                        field_json = make_field_json(field, col_segment, choice_lists)
                        fields.append(field_json)
                    idx += 1
                #Now set the Y and height of the segments
                max_bottom_y = 0
                for col_segment in col_segments:
                    for row_segment in col_segment['row_segments']:
                        row_segment.pop('row_segments')
                        bottom_y = row_segment['segment_height'] + row_segment['segment_y']
                        if max_bottom_y < bottom_y:
                            max_bottom_y = bottom_y
                            
                for col_segment in col_segments:
                    bottom_segment = col_segment.pop('row_segments')[-1]
                    bottom_segment['segment_height'] = max_bottom_y - bottom_segment['segment_y']
                segment["segment_y"] = max_bottom_y
            else:
                field_segment = segment.copy()
                field_json = make_field_json(field, field_segment, choice_lists)
                if not field_json:
                    continue
                fields.append(field_json)
                segment['segment_y'] = field_segment['segment_y'] + field_segment['segment_height']
            pass
        return fields
    output["fields"] = generate_fields(xlsform_obj['survey'], {
                                                               'segment_x' : margin_x,
                                                               'segment_y' : margin_y,
                                                               'segment_width' : form_width - margin_x * 2,
                                                               'segment_height' : 0
                                                               })
    return output
    
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
            os.path.join(os.path.dirname(__file__), "test_output/test.json"),
    ]
    if len(argv) < 3:
        print __doc__
        print 'Usage:'
        print argv[0] + ' path_to_XLSForm output_path'
    else:
        create_form(argv[1], argv[2])
        print 'Conversion complete!'
