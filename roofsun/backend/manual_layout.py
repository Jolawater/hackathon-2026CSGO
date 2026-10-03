"""Explicit panel centres with shared tilt/bearing and the existing row-shade approximation."""
import math
from shapely.geometry import Polygon, box
from shapely.ops import unary_union

def manual_layout(inputs,config,panel):
    if inputs.width<=1 or inputs.depth<=1:return [],[],0,'no_space'
    angle=math.radians(config.azimuth-inputs.roof_rotation)
    co,si=math.cos(angle),math.sin(angle)
    width=panel['width_m'];depth=panel['length_m']*math.cos(math.radians(config.tilt))
    roof=box(.5,.5,inputs.width-.5,inputs.depth-.5)
    obstacles=[box(o.x,o.y,o.x+o.width,o.y+o.depth) for o in inputs.exclusions]
    placements=[];polygons=[]
    for position in config.manual_panels:
        x=position.x+config.offset_x;y=position.y+config.offset_y
        lx=x*co-y*si;ly=x*si+y*co
        local=[[lx-width/2,ly+depth/2],[lx+width/2,ly+depth/2],[lx+width/2,ly-depth/2],[lx-width/2,ly-depth/2]]
        corners=[[a*co+b*si,-a*si+b*co] for a,b in local]
        poly=Polygon(corners)
        if not roof.buffer(1e-8).covers(poly) or any(poly.intersection(o).area>1e-8 for o in obstacles+polygons):return [],[],0,'placement_invalid'
        # Preserve the selected service gap between parallel rows with overlapping spans.
        if any(abs(lx-px)<width-1e-8 and 1e-6<abs(ly-py)<depth+inputs.minimum_access_gap_m-1e-6 for px,py,_ in placements):
            return [],[],0,'placement_invalid'
        placements.append((lx,round(ly,6),corners));polygons.append(poly)
    if not placements:return [],[],0,'no_space'
    ys=sorted({p[1] for p in placements},reverse=True)
    rows=[{'y':y,'count':sum(p[1]==y for p in placements),'intervals':[[x-width/2,x+width/2] for x,py,_ in placements if py==y]} for y in ys]
    panels=[{'corners':corners,'row':ys.index(y),'local_x':x-width/2} for x,y,corners in placements]
    return panels,rows,float(unary_union(polygons).convex_hull.area),None
