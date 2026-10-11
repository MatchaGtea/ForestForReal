"""Audit only: actual ESA WorldCover 2021 samples; not project evidence."""
import json, math, os
from pathlib import Path
import rasterio
os.environ['GDAL_DISABLE_READDIR_ON_OPEN']='EMPTY_DIR'
os.environ['CPL_VSIL_CURL_ALLOWED_EXTENSIONS']='.tif'
os.environ['GDAL_HTTP_TIMEOUT']='30'
os.environ['GDAL_HTTP_MAX_RETRY']='1'
records=json.loads(Path('backend/data/projects.json').read_text(encoding='utf-8'))
audit=[]
for p in records:
    ring=p['geometry']['coordinates'][0]
    x=sum(c[0] for c in ring[:-1])/(len(ring)-1);y=sum(c[1] for c in ring[:-1])/(len(ring)-1)
    tx=int(math.floor(x/3)*3);ty=int(math.floor(y/3)*3)
    url=f'https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_N{ty:02d}E{tx:03d}_Map.tif'
    pts=[[x,y]]+ring[:-1]
    with rasterio.open(url) as ds:
        samples=[int(v[0]) for v in ds.sample(pts)]
    row={'project_id':p['id'],'source':url,'dataset':'ESA WorldCover 2021 v200',
         'samples':list(zip(pts,samples)),'tree_class':10,
         'note':'Static land-cover siting check only. Does not establish project history or trends.'}
    audit.append(row)
    print(p['id'],samples,flush=True)
Path('backend/data/location-audit.json').write_text(json.dumps(audit,indent=2),encoding='utf-8')
