function computeMarkupLocation(field) {
    var minX = 999999;
    var minY = 999999;
    $.each(field.segments, function(segment_idx, segment) {
        if (segment.segment_x < minX) {
            minX = segment.segment_x;
        }
        if (segment.segment_y < minY) {
            minY = segment.segment_y;
        }
    });
    return {
        x: minX + 5,
        y: minY + 2
    };
}

function drawMultilineText($canvas, properties){
    var strings = String(properties.text).split('\n');
    var currentY = properties.y;
    properties = $.extend({
        method: "drawText",
        lineSpacing: 0
    }, properties);
    $.each(strings, function(idx, string) {
        var lineProperties = $.extend(Object.create(properties), {
            text: string,
            y: currentY
        });
        var measurements = $canvas.measureText(lineProperties);
        $canvas.addLayer(lineProperties);
        currentY += properties.lineSpacing + measurements.height;
    });
    return currentY;
}

function viewAsImage() {
    //Create a modal
    var $formImage = $('.formImage');
    var uriContent = $("canvas").getCanvasImage("jpeg", 2.0);
    $formImage.replaceWith('<img src="' + uriContent + '" class="formImage" ></img>');
}
$("canvas").hide();
$('.save-instructions').hide();

function createForm(form) {
    var $canvas = $("canvas").jCanvas();
    var $bar = $('.bar');
    var progress = 10;
    var numFields = form.fields.length;
    var default_font = "9pt Verdana, sans-serif";
    $bar.css('width', '10%');

    //////Draw canvas background:
    $canvas.attr('height', form.height + ' px');
    $canvas.attr('width', form.width + ' px');
    //Make bg white (rather than transparent)
    $canvas.addLayer({
        method: 'drawRect',
        fillStyle: "#fff",
        fromCenter: false,
        x: 0,
        y: 0,
        height: form.height,
        width: form.width
    });
    //Draw page border:
    $canvas.addLayer({
        method: 'drawRect',
        strokeStyle: "#000",
        strokeWidth: 1,
        fromCenter: false,
        x: 12, y: 12,
        width: (form.width - 24),
        height: (form.height - 24)
    });
    $canvas.addLayer({
        method: 'drawRect',
        strokeStyle: "#000",
        strokeWidth: 1,
        fromCenter: false,
        x: 8, y: 8,
        width: (form.width - 16),
        height: (form.height - 16)
    });
    //Draw form title:
    drawMultilineText($canvas, {
        x: form.width / 2,
        y: 50,
        fillStyle: "#000",
        align: "center",
        baseline: "middle",
        font: form.title_font || form.font || default_font,
        text: form.form_title || ''
    });
    //Draw page number
    drawMultilineText($canvas, {
        x: form.width / 2,
        y: (form.height - 30),
        fillStyle: "#000",
        align: "center",
        baseline: "middle",
        font: form.font || default_font,
        text: form.page_number || ''
    });
    
    ///////Draw form:
    $.each(form.fields.concat(form.markup ? form.markup : []), function(field_idx, field) {
        field = $.extend({}, form, field);
        progress += 90 / numFields;
        $bar.css('width', progress + '%');
        
        var markup_object = {
            fillStyle: "#000",
            opacity: 0.7,
            x: 0,
            y: 0,
            align: "left",
            baseline: "top",
            font: field.font || form.font || default_font,
            text: field.label || (field.name || '')
        };
        $.extend(markup_object, computeMarkupLocation(field));
        if ("markup_location" in field) {
            $.extend(markup_object, field.markup_location);
        }

        var textOffset = drawMultilineText($canvas, markup_object);
        
        if(field['type'] === 'qrcode') {
            if('param' in field && field.param !== ''){
                $(document).on('drawQrCodes', function(){
                    var segment = field.segments[0];
                    var topOffset = textOffset - segment.segment_y;
                    var size = Math.min(segment.segment_width - 10, segment.segment_height - topOffset - 10);
                    console.log(size);
                    $canvas.qrcode({
                        width: size,
                        height: size,
                        left: segment.segment_x + 5,
                        top: textOffset  + 5,
                        text: field.param
                    });
                });
            }
        }
        
        $.each(field.segments, function(segment_idx, segment) {
            var classifier;
            segment = $.extend({}, field, segment);
            classifier = segment.classifier;
            $canvas.addLayer({
                method: 'drawRect',
                strokeStyle: "#000000",
                strokeWidth: 2,
                fromCenter: false,
                x: segment.segment_x,
                y: segment.segment_y,
                width: segment.segment_width,
                height: segment.segment_height
            });
            if ('items' in segment) {
                $.each(segment.items, function(item_idx, item) {
                    $canvas.addLayer({
                        method: classifier.training_data_uri === "bubbles" ? "drawEllipse" : "drawRect",
                        strokeStyle: "#55d",
                        strokeWidth: 1.6,
                        fromCenter: true,
                        name: "myBox",
                        group: "myBoxes",
                        x: segment.segment_x + item.item_x,
                        y: segment.segment_y + item.item_y,
                        width: classifier.classifier_width * 0.65,
                        height: classifier.classifier_height * 0.65
                    });
                    if ('label' in item) {
                        var itemLabelObj = {
                            fillStyle: "#000",
                            opacity: 0.7,
                            x: segment.segment_x + item.item_x - (0.75 * classifier.classifier_width),
                            y: segment.segment_y + item.item_y,
                            align: "right",
                            font: field.font || form.font || default_font,
                            text: item.label
                        };
                        drawMultilineText($canvas, itemLabelObj);
                    }
                });
            }
        });

    });
    
    $canvas.drawLayers();
    
    if (progress >= 99) {
        window.setTimeout(function() {
            $bar.parent().hide();
            $('.save-instructions').show();
        }, 1000);
    }
    
    var drawFiducials = function(userDefFiducials){
        var fiducials = {
            tr: {
                source: "fiducials/cs.jpg",
                x: form.width - 70,
                y: 55
            },
            bl: {
                source: "fiducials/villagereach.png",
                x: 142,
                y: (form.height - 40)
            },
            br: {
                source: "fiducials/ScanLogoSm.png",
                x: (form.width - 110),
                y: (form.height - 45)
            }
        };
        if (userDefFiducials) {
            $.extend(fiducials, userDefFiducials);
        }

        console.log(fiducials);
        
        $canvas.qrcode({
            width: 64,
            height: 64,
            left: 20,
            top: 20,
            text: form.qrcode_data || form.title || "no data"
        });
        
        $(document).trigger('drawQrCodes');
        
        //This is a function that gets called after each fiducial is loaded
        //And when all the fiducials finish loading it draws the image.
        var fiducialLoaded = (function() {
            console.log(fiducials, Object.keys(fiducials));
            var fiducialsToLoad = Object.keys(fiducials).length;
            return function(){
                console.log('fiducial loaded');
                fiducialsToLoad--;
                if (fiducialsToLoad === 0) {
                    viewAsImage();
                }
            };
        })();
        $.each(fiducials, function(fidName, fiducial) {
            $canvas.drawImage($.extend({}, {
                layer: true,
                group: "fiducials",
                name: fidName,
                x: 0,
                y: 0,
                load: fiducialLoaded,
                fromCenter: true
            }, fiducial));
        });
        
        window.setTimeout(function() {
            //If the fiducials don't load in 10 seconds pretend they did.
            fiducialLoaded();
            fiducialLoaded();
            fiducialLoaded();
        }, 10000);
    };
    drawFiducials();
    
    var updateFiducials = function(){
        var userDefFiducials = {};
        $.when.apply(null, $('.fiducial').map(function(fidx, fiducial){
            var dfd = $.Deferred();
            var fileInput = $(fiducial).find('[type="file"]').get(0);
            var reader = new FileReader();
            if(fileInput.files.length > 0) {
                reader.onload = function(e) {
                    userDefFiducials[$(fiducial).data('position')] = {
                        source: e.target.result,
                        x: parseInt($(fiducial).find('.x').val() || 0, 10),
                        y: parseInt($(fiducial).find('.y').val() || 0, 10)
                    };
                    dfd.resolve();
                };
                reader.readAsDataURL(fileInput.files[0]);
            } else {
                dfd.resolve();
            }
            return dfd;
        })).then(function(){
            $canvas.removeLayerGroup("fiducials");
            $canvas.drawLayers();
            drawFiducials(userDefFiducials);
        });
        
    };
    
    $('.fiducialFile, .x, .y').on('change', updateFiducials);
}