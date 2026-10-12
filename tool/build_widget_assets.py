"""Convert original Android vector icons to SVG without redrawing paths."""
from pathlib import Path
import xml.etree.ElementTree as ET
root=Path(__file__).resolve().parents[1]
out=root/'build/web/widget-assets/icons';out.mkdir(parents=True,exist_ok=True)
android='{http://schemas.android.com/apk/res/android}'
names=['ic_widget_calendar','ic_widget_reload','ic_widget_bell','ic_widget_up','ic_widget_down','ic_widget_back','ic_widget_study','ic_overview_chevron_left','ic_overview_chevron_right']
for name in names:
    source=root/'reference/android/android/app/src/main/res/drawable'/(name+'.xml')
    vector=ET.parse(source).getroot()
    svg=ET.Element('svg',{'xmlns':'http://www.w3.org/2000/svg','viewBox':f"0 0 {vector.attrib[android+'viewportWidth']} {vector.attrib[android+'viewportHeight']}"})
    for node in vector.iter('path'):
        color=node.attrib.get(android+'fillColor','#ffffff')
        attr={'d':node.attrib[android+'pathData'],'fill':color[-6:] if False else color}
        if len(color)==9:
            attr['fill']='#'+color[3:];attr['fill-opacity']=str(int(color[1:3],16)/255)
        for key,new in [('strokeColor','stroke'),('strokeWidth','stroke-width'),('strokeLineCap','stroke-linecap'),('strokeLineJoin','stroke-linejoin'),('fillType','fill-rule')]:
            if android+key in node.attrib:attr[new]=node.attrib[android+key]
        ET.SubElement(svg,'path',attr)
    ET.ElementTree(svg).write(out/(name+'.svg'),encoding='unicode')
print(f'{len(names)} original vector icons converted')
