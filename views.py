from django.http import HttpResponse
from django.shortcuts import render_to_response
from django import forms

import datetime
import tempfile
import os

import xlsform2

SERVER_TMP_DIR = '/tmp'

class UploadFileForm(forms.Form):
    file  = forms.FileField()

def index(request):
    if request.method == 'POST':
        form = UploadFileForm(request.POST, request.FILES)
        if form.is_valid():
            error = None
            warnings = None
            
            filename, ext = os.path.splitext(request.FILES['file'].name)
            
            #Make a randomly generated directory to prevent name collisions
            temp_dir = tempfile.mkdtemp(dir=SERVER_TMP_DIR)
            out_path = os.path.join(temp_dir, filename + '.json')
            #Init the output xml file.
            fo = open(out_path, "wb+")
            fo.close()
            
            try:
                warnings = []
                xlsform2.spreadsheet_to_json(request.FILES['file'], out_path)
                
            except Exception as e:
                error = 'Error: ' + str(e)
            
            return render_to_response('upload.html', {
                'form': UploadFileForm(),#Create a new empty form
                'dir': os.path.split(temp_dir)[-1],
                'name' : filename + '.json',
                'error': error,
                'warnings': warnings,
            })
        else:
            #Fall through and use the invalid form
            pass
    else:
        form = UploadFileForm() #Create a new empty form
        
    return render_to_response('upload.html', {
        'form': form,
    })
    
def download(request, path):
    """
    Serve a downloadable file
    """
    fo = open(os.path.join(SERVER_TMP_DIR, path))
    data = fo.read()
    fo.close()
    response = HttpResponse(mimetype='application/octet-stream')
    response.write(data)
    return response
    
def serve_json(request, path):
    """
    Serve a downloadable file
    """
    fo = open(os.path.join(SERVER_TMP_DIR, path))
    data = fo.read()
    fo.close()
    response = HttpResponse(mimetype="application/json")
    response.write(data)
    return response