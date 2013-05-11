/*
XLS file is converted to json with some basic processing to nest
groups and parse type parameters.
The JSON is fed into a handlebars template that generates the HTML.
A number of helpers are defined to help render certain items.
After the HTML is rendered, jQuery is used to construct the formdef json from it.
*/
//TODO: Rather than having a multiple segments template,
//make one for bub_* widgets
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
                processedWorkbook.filename = f.name;
                
                console.log(JSON.stringify(processedWorkbook, 0, 2));
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
    //Clear the file input so the form can be updated:
    $('.xlsxfile').val("");
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

Handlebars.registerHelper("qrcode", function(data) {
    var size = (1 + Math.floor(data.length / 40)) * 96;
    return new Handlebars.SafeString('<img src="' +
        $('<canvas width=' + size + ' height=' + size + '>').qrcode({
            width: size,
            height: size,
            text: data
        }).get(0).toDataURL('image/jpeg') + '"></img>');
});

var typeAliases = {
    "text" : "string",
    "integer" : "int",
    "select_one" : "select1",
    "select_multiple" : "select"
};

var renderForm = function(formJSON){
    console.log("Rendering...", formJSON);

    var alignment_radius =  _.findWhere(formJSON.settings, {
        setting: 'alignment_radius'
    });
    alignment_radius = alignment_radius ? alignment_radius.value : 0;
    
    var bubbleClassifier = {
        "classification_map": {
             "empty": false
        },
        "default_classification": true,
        "training_data_uri": "bubbles",
        "classifier_height": 16,
        "classifier_width": 14,
        "alignment_radius": alignment_radius,
        "advanced": {
             "flip_training_data": true
        }
    };
    var checkboxClassifier = _.extend({}, bubbleClassifier, {
        "training_data_uri": "square_checkboxes",
    });
    var defaultScanJSON = {
        height: 1088,
        width: 832,
        classifier : bubbleClassifier
    };

    var globalCounter = 0;
    
    //The field map will be populated by preprocess
    //provide an easy way to reference the augmented JSON for each field
    //for use in the Scan JSON output.
    var fieldMap = {};
    
    //Preprocess does the following:
    //Attach items
    //annotate json with other data
    //set the prompt types
    //generate field map
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
            
            if(field.type.match(/string|int|decimal/)){
                field.segments = [{
                    rows: _.range(field.rows ? field.rows : 0)
                }];
            } else if(field.type.match(/select/)){
                if(field.type === "select") {
                    field.classifier = checkboxClassifier;
                }
                field.segments = [{
                    items : _.map(formJSON.choices[field.param], function(item){
                        if(field.type === "select1") {
                            item.objectClass = "bubble";
                        }
                        return item;
                    })
                }];
            } else if(field.type.match(/tally/)){
                field.segments = [{
                    items :  _.map(_.range(parseInt(field.param, 10)), function(rIdx){
                        return {
                            value: rIdx,
                            objectClass: "bubble"
                        };
                    })
                }];
                console.log(field);
            } else if(field.type.match(/bub_num/)){
                field.segments = _.map(_.range(parseInt(field.param, 10)), function(){
                    return { };
                });
                _.each(field.segments, function(segment){
                    segment.items = _.map(_.range(0, 10), function(rIdx){
                        return {
                            value: rIdx,
                            label: "" + rIdx,
                            class: "vertical",
                            objectClass: "bubble"
                        };
                    });
                });
                field.labels = _.map(_.range(0, 10), function(rIdx){
                    return "" + rIdx;
                });
                //Makes scan combine all the values
                //rather than putting a space between them.
                field.delimiter = "";
                field.type = "int";
            } else if(field.type.match(/bub_word/)){
                var alphabet = (' abcdefghijklmnopqrstuvwxyz').split('');
                field.segments = _.map(_.range(parseInt(field.param, 10)), function(){
                    return { };
                });
                _.each(field.segments, function(segment){
                    segment.items = _.map(alphabet, function(letter){
                        return {
                            value: letter,
                            label: letter,
                            class: "vertical",
                            objectClass: "bubble"
                        };
                    });
                });
                field.labels = _.map(alphabet, function(letter){
                    return letter;
                });
                //Makes scan combine all the values
                //rather than putting a space between them.
                field.delimiter = "";
                field.type = "string";
            } else if(field.type.match(/qrcode/)){
                field.segments = [{
                    qrcodeData : field.param
                }];
            }
            
            if(!('name' in field)){
                field.name = "autogenerated_name_" + globalCounter;
                globalCounter++;
            }
            
            fieldMap[field.name] = _.omit(field, ['segments', 'labels']);
        });
    };
        
    var generateScanJSON = function($formImage){
        var formDef = _.clone(defaultScanJSON);

        //Generate the formDef json using the HTML.
        var baseOffset = $formImage.offset();
        formDef.fields = $formImage.find('.scanField').map(function(idx, fieldEl){
            var $field = $(fieldEl);
            var fieldName = $field.data('name');
            if(!fieldName){
                console.error("Skipping field with no name.", $field);
                return null;
            }
            var out = fieldMap[fieldName];
            if(out.type === "markup"){
                return null;
            }
            
            //We use this label to strip html formatting.
            out.label = $field.find('label').first().text();
            
            var segments = $field.find('.segment').map(function(idx, segmentEl){
                var $segment = $(segmentEl);
                var segAbsOffset = $segment.offset();
                var segOffset = {
                    top: segAbsOffset.top - baseOffset.top,
                        //(parseInt($segment.css("border-top-width"), 10)  / 2),
                    left: segAbsOffset.left - baseOffset.left
                        //(parseInt($segment.css("border-left-width"), 10) / 2)
                };
                var items = $segment
                    .find('.classifiableObject')
                    .map(function(idx, itemEl){
                    var $item = $(itemEl);
                    var itemAbsOffset = $item.offset();
                    //I think an ideal solution would be to use floats
                    //throughout the pipeline.
                    //Text dimensions (em/pt) cause issues because they lead to
                    //partial pixel measurements that cause rounding errors.
                    var itemOffset = {
                        top: itemAbsOffset.top - segAbsOffset.top +
                            ($item.innerHeight() + $item.outerHeight()) / 4,
                        left: itemAbsOffset.left - segAbsOffset.left +
                            ($item.innerWidth() + $item.outerWidth()) / 4,
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
                    //Need to fix this...
                    align_segment: true,
                    segment_x: segOffset.left,
                    segment_y: segOffset.top,
                    segment_width: ($segment.innerWidth() +
                        $segment.outerWidth()) / 2,
                    segment_height: ($segment.innerHeight() +
                        $segment.outerHeight()) / 2
                };
                if(items.length > 0) {
                    segment.items = items;
                }
                return segment;
            }).toArray();
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
        var title =  _.findWhere(formJSON.settings, {setting: 'form_title'});
        title = title ? title.value : "";
        var font =  _.findWhere(formJSON.settings, {setting: 'font'});
        font = font ? font.value : "";
        var title_font =  _.findWhere(formJSON.settings, {setting: 'title_font'});
        title_font = title_font ? title_font.value : "";
        
        $el.html(formTemplate({
            prompts: formJSON.survey,
            title: title,
            font: font,
            title_font: title_font
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
        
        	var reader = new FileReader();
            
            var $targetEl = $(e.target);
        
            reader.onload = function(e) {
        		$targetEl.attr('src', e.target.result);
                generateZip();
        	};
            reader.readAsDataURL(files[0]);
        });
        
        //Set some of the dimensions using the defaultScanJSON:
        $el.height(defaultScanJSON.height);
        $el.width(defaultScanJSON.width);
        var coHeight = Math.round(
            bubbleClassifier.classifier_height * 0.64);
        var coWidth = Math.round(
            bubbleClassifier.classifier_width * 0.64);
        $el.find(".classifiableObject").height(coHeight);
        $el.find(".classifiableObject").width(coWidth);
        $el.find(".bubble").css('borderRadius', coWidth / 2);
        //Ensure the bub_num and bub_work widgets line up:
        $el.find(".vertical").height(bubbleClassifier.classifier_height + 2);
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
                    var formName = formJSON.filename ? formJSON.filename.slice(0,-5) : "template";
                    var prefix = _.reduce(_.range(pageIdx), function(memo){
                        return memo + "nextPage/";
                    }, formName + "/");
                    
                    $img.attr('src', dataURL);
                    
                    zip.file(prefix + "template.json",
                        JSON.stringify(formDef,null,2));
                    zip.file(prefix + "form.jpg",
                        dataURL.substr("data:image/jpeg;base64,".length),
                        { base64: true });
                    
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
    
    $('#download').html("<div>Genenrating template...</div>");
    //TODO: Fix this hack.
    //Wait for the DOM stuff before generating the JSON
    window.setTimeout(generateZip, 500)

};
   
//$.getJSON('test.json', renderForm);
/*
$.get('documentation.textile', function ( txt ) {
    $( '.modal-body' ).html( textile( txt ) );
});
*/ 
});