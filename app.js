/*
XLS file is converted to json with some basic processing to nest
groups and parse type parameters.
The JSON is fed into a handlebars template that generates the HTML.
A number of helpers are defined to help render certain items.
After the HTML is rendered, jQuery is used to construct the formdef json from it.
*/
$(document).ready(function () {

function removeEmptyStrings(rObjArr){
    var outArr = [];
    _.each(rObjArr, function(row){
        var outRow = Object.create(row.__proto__);
        _.each(row, function(value, key){
            if(_.isString(value) && value.trim() === "") {
                return;
            }
            outRow[key] = value;
        });
        if(_.keys(outRow).length > 0) {
            outArr.push(outRow);
        }
    });
    return outArr;
}

function to_json(workbook) {
    var result = {};
    _.each(workbook.SheetNames, function(sheetName) {
    	var rObjArr = XLSX.utils.sheet_to_row_object_array(workbook.Sheets[sheetName]);
        rObjArr = removeEmptyStrings(rObjArr);
		if(rObjArr.length > 0){
			result[sheetName] =  rObjArr;
		}
	});
	return result;
}

function handleDrop(evt) {
	evt.stopPropagation();
	evt.preventDefault();
	var files = evt.target.files;
	var f = files[0];

	var reader = new FileReader();
	var name = f.name;
    
    //Clear the warnings and errors:
    $('#errors').empty();
    $('#warnings').empty();
    $('#download').empty();

    reader.onload = function(e) {
		var data = e.target.result;
        if(f.name.slice(-3) === "xls"){
            $("#errors").append("<p>Sorry, XLS files are not supported.<br />You can convert your XLS file to XLSX using libreOffice or Google Docs.</p>");
        } else {
             try {
                var xlsx = XLSX.read(data, {type: 'binary'});
                var jsonWorkbook = to_json(xlsx);
                //console.log(jsonWorkbook);
                var processedWorkbook = XLSXConverter.processJSONWorkbook(jsonWorkbook);
                
                console.log(JSON.stringify(processedWorkbook, 0, 2))
                renderForm(processedWorkbook);
                
                _.each(XLSXConverter.getWarnings(), function(warning){
                    var $warningEl = $("<p>");
                    $warningEl.text(warning);
                    $("#warnings").append($warningEl);
                });
            } catch(e) {
                var $errorEl = $("<p>");
                $errorEl.text(String(e));
                $("#errors").append($errorEl);
                throw e;
            }
        }
	};
    try {
        reader.readAsBinaryString(f);
    } catch(e) {
        $("#errors").append("<p>Could not read file.</p>");
        throw e;
    }
}

$('.xlsxfile').change(handleDrop);

//Handlebars compilation of the templates at the bottom of index.html:
var formTemplate = Handlebars.compile($("#form-template").html());

// compile and register the "element" partial template
var fieldRowTemplate = Handlebars.compile($("#field-row-template").html());
Handlebars.registerPartial("fieldRow", fieldRowTemplate);

var fieldColumnTemplate = Handlebars.compile($("#field-column-template").html());
Handlebars.registerPartial("fieldColumn", fieldColumnTemplate);

var segmentsTemplate = Handlebars.compile($("#segments-template").html());
Handlebars.registerPartial("segments", segmentsTemplate);

var segmentTemplate = Handlebars.compile($("#segment-template").html());
Handlebars.registerPartial("segment", segmentTemplate);

var typeAliases = {
    "text" : "string",
    "select_one" : "select1",
    "select_mulitple" : "select"
};

var renderForm = function(formJSON){
    console.log("Rendering...", formJSON);
    
    //The field map will be populated by preprocess
    //provide an easy way to reference the augmented JSON for each field
    //for use in the Scan JSON output.
    var fieldMap = {};
    
    //Attach items
    //set the prompt types
    var preprocess = function(fields) {
        _.each(fields, function(field) {
            if('prompts' in field){
                preprocess(field.prompts);
                return;
            }
            field.type = field.type.toLowerCase();
            
            //Map from XLSForm types to internal type names that are closer
            //to XForm types.
            if(field.type in typeAliases) {
                field.type = typeAliases[field.type];
            } 
            
            if(field.type.match(/string|int/)){
                field.segments = [{}];
            }
            if(field.type.match(/select/)){
                field.segments = [{ items : formJSON.choices[field.param] }];
            }
            if(field.type.match(/tally/)){
                field.segments = [{ items :  _.map(_.range(parseInt(field.param, 10)), function(rIdx){
                        return { value: rIdx };
                    })
                }];
                console.log(field);
            }
            if(field.type.match(/bub_num/)){
                field.segments = _.map(_.range(parseInt(field.param, 10)), function(){
                    return { };
                });
                _.each(field.segments, function(segment){
                    segment.items = _.map(_.range(0, 10), function(rIdx){
                        return { value: rIdx, label: "" + rIdx, class: "vertical"};
                    });
                });
                field.labels = _.map(_.range(0, 10), function(rIdx){
                    return "" + rIdx;
                });
            }
            if(field.type.match(/bub_word/)){
                var alphabet = ('abcdefghijklmnopqrstuvwxyz').split('');
                field.segments = _.map(_.range(parseInt(field.param, 10)), function(){
                    return { };
                });
                _.each(field.segments, function(segment){
                    segment.items = _.map(alphabet, function(letter){
                        return { value: letter, label: letter, class: "vertical" };
                    });
                });
                field.labels = _.map(alphabet, function(letter){
                    return letter;
                });
            }
            fieldMap[field.name] = _.omit(field, ['segments', 'labels']);
        });
    };
    
    var defaultScanJSON = {
        height: 1088,
        width: 832,
        classifier : {
            "classification_map": {
                 "empty": false
            },
            "default_classification": true,
            "training_data_uri": "bubbles",
            "classifier_height": 16,
            "classifier_width": 14,
            "advanced": {
                 "flip_training_data": true
            }
        }
    };
        
    var generateScanJSON = function($formImage){
        var formDef = _.clone(defaultScanJSON);

        //Generate the formDef json using the HTML.
        var baseOffset = $formImage.offset();
        formDef.fields = $(".formImage").find('.scanField').map(function(idx, fieldEl){
            var $field = $(fieldEl);
            var fieldName = $field.data('name');
            if(!fieldName){
                return null;
            }
            
            var segments = $field.find('.segment').map(function(idx, segmentEl){
                var $segment = $(segmentEl);
                var segAbsOffset = $segment.offset();
                var segOffset = {
                    top: segAbsOffset.top - baseOffset.top,
                        //(parseInt($segment.css("border-top-width"), 10)  / 2),
                    left: segAbsOffset.left - baseOffset.left
                        //(parseInt($segment.css("border-left-width"), 10) / 2)
                };
                var items = $segment.find('.bubble').map(function(idx, itemEl){
                    var $item = $(itemEl);
                    var itemAbsOffset = $item.offset();
                    var itemOffset = {
                        top: Math.round(itemAbsOffset.top - segAbsOffset.top + ($item.innerHeight() + $item.outerHeight()) / 4),
                        left: Math.round(itemAbsOffset.left - segAbsOffset.left + ($item.innerWidth() + $item.outerWidth()) / 4),
                    };
                    return {
                        //In theory this should remove any html markup.
                        label: $item.parent().children('label').text(),
                        value: $item.parent().data('value'),
                        item_x: itemOffset.left,
                        item_y: itemOffset.top
                    };
                }).toArray();
                var segment = {
                    segment_x: segOffset.left,
                    segment_y: segOffset.top,
                    segment_width: ($segment.innerWidth() + $segment.outerWidth()) / 2,
                    segment_height: ($segment.innerHeight() + $segment.outerHeight()) / 2
                };
                if(items.length > 0) {
                    segment.items = items;
                }
                return segment;
            }).toArray();

            var out = fieldMap[fieldName];
            //We use this label to strip html formatting.
            out.label = $field.find('label').first().text();
            if(segments.length > 0) {
                out.segments = segments;
            }
            return out;
        }).toArray();
        return formDef;
    };

    var generateFormPageHTML = function($el, formJSON){
        //Generate the form image as HTML.
        console.log("test");
        var title =  _.where(formJSON.settings, {setting: 'form_title'});
        title = title ? title[0].value : "";
        
        $el.html(formTemplate({
            prompts: formJSON.survey,
            title: title
        }));
        
        //Fiducal replacement functionality
        var $fiducials = $(".fContainer").find('img');
        $fiducials.on('dragover', function(e){
            e.stopPropagation();
            e.preventDefault();
        	e.originalEvent.dataTransfer.dropEffect = 'copy';
        });
        $fiducials.on('drop', function(e){
            e.stopPropagation();
            e.preventDefault();
        	var files = e.originalEvent.dataTransfer.files;
        	var f = files[0];
        
        	var reader = new FileReader();
            
            var $targetEl = $(e.target);
        
            reader.onload = function(e) {
        		$targetEl.attr('src', e.target.result);
                generateZip();
        	};
            reader.readAsDataURL(f);
        });
        
        //Set some of the dimensions using the defaultScanJSON:
        $el.height(defaultScanJSON.height);
        $el.width(defaultScanJSON.width);
        $el.find(".bubble").height(Math.round(defaultScanJSON.classifier.classifier_height * 0.7));
        $el.find(".bubble").width(Math.round(defaultScanJSON.classifier.classifier_width  * 0.7));
        $el.find(".bubble").css('borderRadius', Math.round((defaultScanJSON.classifier.classifier_width  * 0.7) / 2));
        return $el;
    };
    
    preprocess(formJSON.survey);
    //partition the formJSON into multiple objects
    //by pagebreaks
    var pages = _.reduce(formJSON.survey, function(memo, row){
        if(row.type === "pagebreak"){
            memo.push([]);
        } else {
            memo[memo.length - 1].push(row);
        }
        return memo;
    }, [[]]);
    
    pages = _.filter(pages, function(page){
        return page.length !== 0;
    })

    $('.fContainer').empty();
    
    var generatedHTMLPages = _.map(pages, function(page, pageIdx){
        var $pageHTML = $('<div class="formImage">');
        $('.fContainer').append($pageHTML);
        generateFormPageHTML($pageHTML, _.extend({}, formJSON, {
            survey: page
        }));
        return $pageHTML;
    });
    
    var generateZip = function(){
        $('#download').html("<div>Genenrating template...</div>");
        $('.outImgs').empty();
        var zip=new MyJSZip();
        $.when.apply(null, _.map(generatedHTMLPages, function($pageHTML, pageIdx){
            var promise = $.Deferred();
            
            var formDef = generateScanJSON($pageHTML);
            
            //outImgs are used for printing...
            //This is kept separate from the src setting below
            //so its inserted in page order.
            var $img = $('<img>');
            $('.outImgs').append($img);
            
            //Generate the form image from the html.
            html2canvas([$pageHTML.get(0)], {
                onrendered: function(canvas) {
                    var dataURL=canvas.toDataURL('image/jpeg');
                    var prefix = _.reduce(_.range(pageIdx), function(memo){
                        return memo + "nextPage/";
                    }, "");
                    
                    $img.attr('src', dataURL);
                    
                    zip.file(prefix + "template.json", JSON.stringify(formDef,null,2));
                    zip.file(prefix + "form.jpg", dataURL.substr("data:image/jpeg;base64,".length), { base64: true });
                    
                    promise.resolve();
                }
            });
            return promise;
        })).then(function(){
            var zipped=zip.generate({
                type:'blob'
            });
            $('#download').html($('#download-notice').html());
            var $downloadBtn=$('#download').find('.download');
            $downloadBtn.attr('href', window.URL.createObjectURL(zipped));
            $downloadBtn.attr('download', "template.zip");
        });
    }
    generateZip();

};
   
$.getJSON('test.json', renderForm);

$.get('documentation.textile', function ( txt ) {
    $( '.modal-body' ).html( textile( txt ) );
});
   
});