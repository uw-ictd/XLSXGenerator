function getParameter(paramName, defaultValue) {
    var searchString = window.location.search.substring(1);
    searchString = searchString ? searchString : window.location.hash.substring(2);
    var params = searchString.split('&');
    for (var i = 0; i < params.length; i++) {
        var val = params[i].split('=');
        if (val[0] === paramName) {
            return decodeURI(val[1]);
        }
    }
    return defaultValue;
}

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
        x: minX,
        y: minY - 20
    };
}

$('.viewAsImage').click(function() {
    //Create a modal
    $('body').append("<img src='" + uriContent + "' style='display: none;' ></img>");
    var $body = $('.modal-body');
    $body.empty();
    var uriContent = $("canvas").getCanvasImage("jpeg", 1.0);
    $body.append("<img src='" + uriContent + "' ></img>");
    $('#myModal').modal('show');
});

function createForm(form) {
    var $canvas = $("canvas").jCanvas();
    var $bar = $('.bar');
    var progress = 10;
    var numFields = form.fields.length;
    $bar.css('width', '10%');

    //////Draw canvas background:
    $canvas.attr('height', form.height + ' px');
    $canvas.attr('width', form.width + ' px');

    $canvas.addLayer({
        method: 'drawRect',
        fillStyle: "#fff",
        fromCenter: false,
        x: 0,
        y: 0,
        height: form.height,
        width: form.width
    });

    var fiducials = [{
        source: "fiducials/cs.jpg",
        x: 50,
        y: 50
    }, {
        source: "fiducials/villagereach.jpg",
        x: form.width - 50,
        y: form.height - 30
    }, {
        source: "fiducials/scan.png",
        x: 70,
        y: (form.height - 30)
    }, {
        source: "fiducials/change.jpg",
        x: form.width - 50,
        y: 50
    }];
    if ('fiducials' in form) {
        fiducials = form.fiducials;
    }
    $.each(fiducials, function(fiducial_idx, fiducial) {
        $canvas.drawImage($.extend({}, {
            x: 0,
            y: 0,
            fromCenter: true //I think this has to be true if there is no height/width
        }, fiducial));
    });
    ///////Draw form:
    $.each(form.fields, function(field_idx, field) {
        var classifier = field.classifier;
        progress += 90 / numFields;
        $bar.css('width', progress + '%');

        var markup_object = {
            method: "drawText",
            fillStyle: "#000",
            opacity: 0.7,
            x: 0,
            y: 0,
            align: "left",
            font: "12pt Verdana, sans-serif",
            text: field.label || field.name
        };
        $.extend(markup_object, computeMarkupLocation(field));
        if ("markup_location" in field) {
            $.extend(markup_object, field.markup_location);
        }

        var textLayer = $canvas.addLayer(markup_object);

        $.each(field.segments, function(segment_idx, segment) {
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
            classifier = segment.classifier || classifier;

            $.each(segment.items, function(item_idx, item) {
                $canvas.addLayer({
                    method: classifier.training_data_uri === "bubbles" ? "drawEllipse" : "drawRect",
                    strokeStyle: "#55d",
                    strokeWidth: 2,
                    fromCenter: true,
                    name: "myBox",
                    group: "myBoxes",
                    x: segment.segment_x + item.item_x,
                    y: segment.segment_y + item.item_y,
                    width: classifier.classifier_width,
                    height: classifier.classifier_height
                });
                if('label' in item) {
                    var itemLabelObj = {
                        method: "drawText",
                        fillStyle: "#000",
                        opacity: 0.7,
                        x: segment.segment_x + item.item_x - classifier.classifier_width,
                        y: segment.segment_y + item.item_y,
                        align: "right",
                        font: "12pt Verdana, sans-serif",
                        text: item.label
                    };
                    $canvas.addLayer(itemLabelObj);
                }
            });
        });
        if (progress == 100) {
            window.setTimeout(function() {
                $bar.parent().remove();
            }, 1000);
        }
    });
    $canvas.drawLayers();
}
