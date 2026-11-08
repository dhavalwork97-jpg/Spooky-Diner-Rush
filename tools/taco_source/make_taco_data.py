import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(HERE, '..', '..', 'data', 'taco.json')
hot = json.load(open(os.path.join(HERE, 'taco_fiesta_hotspots.json')))
P = ['chicken','shrimp','fish','veggies']
soft_tail = {
 'chicken': ['topping_lettuce','topping_tomato_slices','cooler_cheese'],
 'shrimp':  ['topping_shredded_bowl','topping_crema'],
 'fish':    ['topping_shredded_bowl','cooler_limes'],
 'veggies': ['topping_guacamole','topping_salsa_red_bowl'],
}
unlock = {  # soft 15-16, crispy 17-18, burrito 19-20, nachos 21-22
 'soft':   {'chicken':15,'veggies':15,'shrimp':16,'fish':16},
 'crispy': {'chicken':17,'veggies':17,'shrimp':18,'fish':18},
 'burrito':{'chicken':19,'veggies':19,'shrimp':20,'fish':20},
 'nachos': {'chicken':21,'veggies':21,'shrimp':22,'fish':22},
}
money = {'soft':(34,40),'crispy':(44,50),'burrito':(62,70),'nachos':(70,78)}
names = {'chicken':'Chicken','shrimp':'Shrimp','fish':'Fish','veggies':'Veggie'}
dishes=[]
for p in P:
    steps=['tortilla_flour_tortillas',f'protein:{p}']+soft_tail[p]
    dishes.append(dict(id=f'{p}_soft_taco',name=f'{names[p]} soft taco',kind='soft_taco',protein=p,unlockLevel=unlock['soft'][p],price=money['soft'][0],xp=money['soft'][1],steps=steps,frames=list(range(len(steps))),sheet=f'taco_soft_{p}_build',sprite=f'taco_soft_{p}'))
sprite_crispy={'chicken':'taco_chicken','shrimp':'taco_shrimp','fish':'taco_fish','veggies':'taco_veggie'}
for p in P:
    steps=['crispy_shell',f'protein:{p}']+soft_tail[p]
    dishes.append(dict(id=f'{p}_taco',name=f'{names[p]} crispy taco',kind='crispy_taco',protein=p,unlockLevel=unlock['crispy'][p],price=money['crispy'][0],xp=money['crispy'][1],steps=steps,frames=None,sheet=None,sprite=sprite_crispy[p]))
for p in P:
    steps=['tortilla_flour_tortillas','steam_white_rice','steam_beans','cooler_cheese',f'protein:{p}','action:wrap','pan:press','action:cut']
    dishes.append(dict(id=f'{p}_burrito',name=f'{names[p]} burrito',kind='burrito',protein=p,unlockLevel=unlock['burrito'][p],price=money['burrito'][0],xp=money['burrito'][1],steps=steps,frames=[0,1,1,1,1,4,5,6],sheet=f'burrito_{p}',sprite=f'burrito_{p}'))
for p in P:
    steps=['tortilla_corn_tortillas','cooler_cheese','oven:melt',f'protein:{p}','steam_jalapenos','topping_salsa_red_bowl','topping_crema','topping_guacamole']
    dishes.append(dict(id=f'{p}_nachos',name=f'{names[p]} nachos',kind='nachos',protein=p,unlockLevel=unlock['nachos'][p],price=money['nachos'][0],xp=money['nachos'][1],steps=steps,frames=[0,1,2,3,3,3,3,4],sheet=f'nachos_{p}',sprite=f'nachos_{p}'))
labels={
 'tortilla_flour_tortillas':'a flour tortilla','tortilla_corn_tortillas':'corn chips','crispy_shell':'a crispy shell',
 'protein:chicken':'cooked chicken','protein:shrimp':'cooked shrimp','protein:fish':'cooked fish','protein:veggies':'cooked veggies',
 'topping_lettuce':'lettuce','topping_tomato_slices':'tomato','topping_shredded_bowl':'shredded cabbage','topping_salsa_red_bowl':'red salsa',
 'topping_crema':'crema','topping_guacamole':'guacamole','cooler_cheese':'cheese','cooler_limes':'lime','steam_white_rice':'rice',
 'steam_beans':'beans','steam_jalapenos':'jalapenos','action:wrap':'wrapping','pan:press':'pressing in a pan','action:cut':'cutting','oven:melt':'melting in the oven'}
data={
 'restaurant':{'id':'taco_truck','name':'Taco Truck','unlockLevel':15,'cost':2000},
 'settings':{'pans':4,'ovenSlots':2,'plateSlots':2,'seats':5,'drinkLanes':3,'drinkChance':0.25,'maxOrderSize':3,'patienceMult':1.15,'arrivalGapMult':1.15},
 'proteins':{'chicken':{'readyAfter':8,'burnWindow':5},'shrimp':{'readyAfter':5,'burnWindow':4},'fish':{'readyAfter':6,'burnWindow':4},'veggies':{'readyAfter':4,'burnWindow':5}},
 'timed':{'crispy_shell':{'readyAfter':7,'burnWindow':4},'melt':{'readyAfter':5,'burnWindow':4},'press':{'readyAfter':4,'burnWindow':4}},
 'drinks':[
  {'id':'horchata','name':'Horchata','unlockLevel':15,'price':12,'xp':14,'fillSeconds':5,'dispenser':'drink_dispenser_agua','sheetRow':0},
  {'id':'agua_de_jamaica','name':'Agua de jamaica','unlockLevel':15,'price':12,'xp':14,'fillSeconds':5,'dispenser':'drink_dispenser_taco','sheetRow':1}],
 'stepLabels':labels,
 'dishes':dishes}

by_id = {h['id']: h for h in hot['hotspots']}
def rect(h):
    n = by_id[h]['n']
    return dict(x=n['x'], y=n['y'], width=n['w'], height=n['h'])
zones = []
def add(id, action, **kw):
    zones.append(dict(id=id, action=action, **kw, **rect(id)))
for p in P: add(f'griddle_raw_{p}', 'protein', arg=p)
for i in range(1, 5): add(f'pan_{i}', 'pan', index=i - 1)
add('oven_slot_left', 'oven', index=0)
add('oven_slot_right', 'oven', index=1)
used = []
for d in dishes:
    for k, st in enumerate(d['steps']):
        if st.startswith(('protein:', 'action:', 'pan:', 'oven:')) or st == 'crispy_shell': continue
        if st not in used: used.append(st)
for st in used: add(st, 'ingredient', arg=st)
add('pass_slot_1', 'plate', index=0)
add('pass_slot_2', 'plate', index=1)
add('drink_dispenser_agua', 'drinks', arg='horchata')
add('drink_dispenser_taco', 'drinks', arg='agua_de_jamaica')
for disp, drink in (('drink_dispenser_agua', 'horchata'), ('drink_dispenser_taco', 'agua_de_jamaica')):
    for lane in range(1, 4): add(f'{disp}_cup_{lane}', 'cup', arg=drink, index=lane - 1)
add('trash_bin', 'trash')
W, H = hot['imageSize']['w'], hot['imageSize']['h']
win = hot['window']
data['art'] = dict(folder='assets/taco/background', back='kitchen_street_back', front='kitchen_front', width=W, height=H)
data['customerWindow'] = dict(
    slots=[dict(id=s_['id'], x=s_['n']['x'], bottomY=round(s_['bottomY'] / H, 4)) for s_ in win['customerSlots']],
    bandTop=round(win['visibleCustomerBand']['y0'] / H, 4), bandBottom=round(win['visibleCustomerBand']['y1'] / H, 4),
    bubbleY=round(win['orderBubbleAnchorY'] / H, 4),
    dropZone=dict(x=round(win['serveDropZonePx']['x'] / W, 4), y=round(win['serveDropZonePx']['y'] / H, 4), width=round(win['serveDropZonePx']['w'] / W, 4), height=round(win['serveDropZonePx']['h'] / H, 4)))
data['zones'] = zones
open(out, 'w').write(json.dumps(data, indent=1) + '\n')
print(len(dishes), 'dishes', len(zones), 'zones')
