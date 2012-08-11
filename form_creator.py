"""
form_creator.py take an XLSForm (or rather something similar for the time being)
and uses it to create a JSON template and form image for use with ODK Scan.
"""
import json, codecs, sys, os, re
import xlsform2

#TODO: add aliases for types and choice values to standard XLSForms work
#TODO: make the layout more "dynamic" (i.e. make bigger segments when there are more choices)
#TODO: make it possible to set the number of bubbles used by a tally type

def choices2items(choice_list,
                  segment_width,
                  segment_height,
                  x_offset = 70,
                  y_offset = 30,
                  item_width = 100,
                  item_height = 40,
                  item_idx = 0,
                  ):
    for y in range(y_offset,segment_height,item_height):
        for x in range(x_offset,segment_width,item_width):
            if item_idx >= len(choice_list): return choice_list
            choice_list[item_idx].update({
                  "item_x": x,
                  "item_y": y
            })
            item_idx+=1
    return choice_list #TODO In this case, all the choices probably weren't included

def make_json_template(xlsform_obj):
    """
    Create a json template from the xlsform json
    by adding location information to the fields.
    """
    select_regexp = re.compile(r"^(?P<select_type>("
                           + 'select(1)?'
                           + r")) (?P<list_name>\S+)( (?P<specify_other>(or specify other|or_other|or other)))?$")
    
    
    height = 1176 #TODO: What is a good height?
    width = 832
    y_offset = 150 #non-static
    y_incr = 200
    margin_y = 40
    margin_x = 40
    choice_lists = xlsform_obj['choices']
    fields = []
    for field in xlsform_obj['survey']:
        field_type = field['type']
        field['segments'] = [{
              "segment_x": margin_x,
              "segment_y": y_offset,
              "segment_width": width - margin_x * 2,
              "segment_height": y_incr - margin_y
        }]
        select_parse = select_regexp.search(field_type)
        if select_parse:
            parse_dict = select_parse.groupdict()
            select_type = parse_dict.get("select_type")
            if select_type:
                list_name = parse_dict["list_name"]
                if list_name not in choice_lists:
                    raise Exception("List name not in choices sheet: " + list_name + " Error on row: " + str(row_number))
                field['items'] = choices2items(choice_lists[list_name], width - margin_x*2, y_incr - margin_y)
        elif field_type == "tally":
            field['type'] = 'int'
            field['items'] = choices2items([{} for x in range(40)],
                                           width - margin_x*2,
                                           y_incr - margin_y,
                                           x_offset=20,
                                           item_width=40)
        elif field_type == "string" or field_type == "int":
            pass
        else:
            continue
        y_offset += y_incr
        fields.append(field)
    return {
                "height": height,
                "width": width,
                "fields": fields,
                "classifier": {
                        "classification_map": {
                             "empty": False
                        },
                        "default_classification": True,
                        "training_data_uri": "bubbles",
                        "classifier_height": 16,
                        "classifier_width": 14,
                        "advanced": {
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
