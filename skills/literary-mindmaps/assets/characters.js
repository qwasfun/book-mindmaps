  // One edge per pair, at most six neighbors: no full-book hairball.
  const personIndex=new Map(analysis.characters.map(c=>[c.id,c]));
  const personPosition=new Map(analysis.characters.map((c,i)=>[c.id,i]));
  const relationshipTypes=[
    {code:'marriage',label:'夫妻',color:'#a13d64',background:'#fff0f4',border:'#e5b5c8',description:'夫妻、妻妾、订亲与婚配变化'},
    {code:'family',label:'亲属',color:'#28649c',background:'#edf4ff',border:'#b8d0eb',description:'血亲、姻亲、干亲与家内身份纽带'},
    {code:'service',label:'主仆',color:'#87600b',background:'#fff6df',border:'#e3cd94',description:'主仆与主雇关系'},
    {code:'affair',label:'私情',color:'#754ca3',background:'#f5efff',border:'#d2bcea',description:'明确私情、包养或双方调情；不含单向示意与诬称'},
    {code:'social',label:'交往',color:'#247467',background:'#eaf7f2',border:'#b1d9cc',description:'结义、师徒与合作往来'},
    {code:'power',label:'利益',color:'#84583e',background:'#f7eee7',border:'#dbc1ae',description:'官商、馈赠与庇护等利益关系'},
    {code:'conflict',label:'冲突',color:'#b24031',background:'#fff0eb',border:'#e9b6a9',description:'敌对、威胁、诬陷或仇杀'},
    {code:'other',label:'其他',color:'#5e6c77',background:'#f0f3f5',border:'#cbd4dc',description:'其他关系或尚未标注类型的旧记录'},
  ];
  const relationshipTypeIndex=new Map(relationshipTypes.map(t=>[t.code,t]));
  let relationshipType=relationshipTypeIndex.has(saved.relationshipType)?saved.relationshipType:'all';
  const degree=id=>new Set(analysis.relationships.filter(r=>r.from===id||r.to===id).map(r=>r.from===id?r.to:r.from)).size;
  let relatedPerson=null,relationshipPage=0;
  const pageSize=6;
  const picker=byId('person-picker');
  const pickerMedia=matchMedia('(max-width:700px)');
  const syncPicker=()=>{picker.open=!pickerMedia.matches;};
  syncPicker();pickerMedia.addEventListener('change',syncPicker);
  picker.addEventListener('toggle',()=>{if(!pickerMedia.matches&&!picker.open)picker.open=true;});
  // Chapter filters refer to evidence locations, not relationship start/end dates.
  const relatedSections=new Set(analysis.relationships.flatMap(r=>r.evidence.map(e=>sourceIndex.get(e.paragraph_id)?.section_id)));
  for(const section of book.sections.filter(s=>relatedSections.has(s.id))){const option=element('option',section.title);option.value=section.id;byId('relationship-section').append(option);}
  function recordTypes(record){const types=(record.relationship_types||[]).filter(code=>relationshipTypeIndex.has(code));return types.length?[...new Set(types)]:['other'];}
  function baseRelationships(){const classification=byId('relationship-kind').value,section=byId('relationship-section').value;return analysis.relationships.filter(r=>(r.from===person||r.to===person)&&(classification==='all'||r.classification===classification)&&(section==='all'||r.evidence.some(e=>sourceIndex.get(e.paragraph_id)?.section_id===section)));}
  function filteredRelationships(){return baseRelationships().filter(record=>relationshipType==='all'||recordTypes(record).includes(relationshipType));}
  function combinedTypes(records){const codes=new Set(records.flatMap(recordTypes));return relationshipTypes.filter(t=>codes.has(t.code)).map(t=>t.code);}
  function paintRelation(node,types){const code=types.includes(relationshipType)?relationshipType:types[0]||'other',type=relationshipTypeIndex.get(code);node.style.setProperty('--rel-color',type.color);node.style.setProperty('--rel-bg',type.background);node.style.setProperty('--rel-border',type.border);node.dataset.relationTypes=JSON.stringify(types);return node;}
  function renderRelationshipFilters(){const root=byId('relationship-type-filters'),records=baseRelationships();root.replaceChildren();for(const type of [{code:'all',label:'全部',description:'显示符合其他筛选条件的全部关系'},...relationshipTypes]){const matching=type.code==='all'?records:records.filter(r=>recordTypes(r).includes(type.code)),count=new Set(matching.map(r=>r.from===person?r.to:r.from)).size,button=element('button',undefined,'relationship-type-filter');button.id=`rel-type-${type.code}`;button.dataset.relationshipType=type.code;button.setAttribute('aria-label',type.label);button.setAttribute('aria-pressed',String(relationshipType===type.code));button.title=`${type.description} · ${count} 位关联人物`;paintRelation(button,type.code==='all'?['other']:[type.code]);const dot=element('span',undefined,'relation-color-dot');dot.setAttribute('aria-hidden','true');button.append(dot,element('span',type.label),element('span',String(count),'relationship-type-count'));button.addEventListener('click',()=>{relationshipType=type.code;saved.relationshipType=type.code;relationshipPage=0;relatedPerson=null;renderGraph();renderCharacter();save();byId(`rel-type-${type.code}`).focus({preventScroll:true});});root.append(button);}}
  function neighborGroups(){const groups=new Map();for(const r of filteredRelationships()){const id=r.from===person?r.to:r.from;if(!groups.has(id))groups.set(id,{character:personIndex.get(id),records:[]});groups.get(id).records.push(r);}return [...groups.values()].sort((a,b)=>b.records.length-a.records.length||personPosition.get(a.character.id)-personPosition.get(b.character.id));}
  function locationTitles(record){return [...new Set(record.evidence.map(e=>sourceIndex.get(e.paragraph_id)?.section_title).filter(Boolean))];}
  function readableLabel(record){return record.label.replace(/^第\d+(?:[—－-]\d+)?回(?:所见)?[：:、]?\s*/,'');}
  function compact(text,size){return text.length>size?text.slice(0,size)+'…':text;}
  function relationshipTags(records){return [...new Set(records.map(record=>record.short_label||compact(readableLabel(record),10)))];}
  function tagModels(records){return relationshipTags(records).map(text=>({text,types:combinedTypes(records.filter(r=>(r.short_label||compact(readableLabel(r),10))===text))}));}
  function tagList(records){const root=element('span',undefined,'relation-tags');for(const tag of tagModels(records)){const badge=paintRelation(element('span',undefined,'short-relationship-tag'),tag.types),dots=element('span',undefined,'relation-tag-dots');dots.setAttribute('aria-hidden','true');tag.types.forEach(code=>{const dot=element('span',undefined,'relation-color-dot');dot.style.background=relationshipTypeIndex.get(code).color;dots.append(dot);});badge.title=tag.types.map(code=>relationshipTypeIndex.get(code).label).join('、');badge.append(dots,element('span',tag.text,'relation-tag-text'));root.append(badge);}return root;}
  function renderPeople(){const query=byId('person-search').value.trim().toLocaleLowerCase();const shown=analysis.characters.filter(c=>[c.name,...c.aliases].some(n=>n.toLocaleLowerCase().includes(query))).sort((a,b)=>degree(b.id)-degree(a.id)||personPosition.get(a.id)-personPosition.get(b.id));const root=byId('people');root.replaceChildren();for(const c of shown){const button=element('button');button.setAttribute('aria-label',c.name);button.setAttribute('aria-pressed',String(c.id===person));button.append(element('span',c.name),element('span',`${degree(c.id)} 位关联`,'person-degree'));button.addEventListener('click',()=>selectPerson(c.id));root.append(button);}byId('people-count').textContent=`${shown.length} / ${analysis.characters.length} 人 · 按关联人数排列`;if(!shown.length)paragraph(root,'没有匹配的人物，试试别名。','muted');}
  function selectPerson(id){if(!personIndex.has(id))return;person=id;relatedPerson=null;relationshipPage=0;renderPeople();renderGraph();renderCharacter();if(pickerMedia.matches)picker.open=false;save();}
  byId('person-search').addEventListener('input',renderPeople);
  for(const id of ['relationship-kind','relationship-section'])byId(id).addEventListener('change',()=>{relationshipPage=0;relatedPerson=null;renderGraph();renderCharacter();});
  byId('relationship-reset').addEventListener('click',()=>{relationshipType='all';saved.relationshipType='all';byId('relationship-kind').value='all';byId('relationship-section').value='all';relationshipPage=0;relatedPerson=null;renderGraph();renderCharacter();save();});
  const svgNS='http://www.w3.org/2000/svg';
  function svgElement(tag,attrs,text){const e=document.createElementNS(svgNS,tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,String(v));if(text!==undefined)e.textContent=text;return e;}
  function inspectRelationship(id){relatedPerson=id;renderGraph();renderCharacter();if(matchMedia('(max-width:1180px)').matches)byId('character-detail').scrollIntoView({behavior:'smooth',block:'start'});}
  function renderGraph(){
    renderRelationshipFilters();
    const groups=neighborGroups(),focus=personIndex.get(person),total=groups.length;
    relationshipPage=Math.max(0,Math.min(relationshipPage,Math.ceil(total/pageSize)-1));
    const shown=groups.slice(relationshipPage*pageSize,(relationshipPage+1)*pageSize);
    if(!shown.some(g=>g.character.id===relatedPerson))relatedPerson=shown[0]?.character.id||null;
    byId('picker-current').textContent=focus?`当前人物：${focus.name}`:'选择人物';
    byId('focus-name').textContent=focus?.name||'暂无人物';
    byId('focus-count').textContent=`${relationshipType==='all'?'全部类型':relationshipTypeIndex.get(relationshipType).label} · ${total} 位相关人物 · ${groups.reduce((n,g)=>n+g.records.length,0)} 条关系记录`;
    byId('relationship-pagination').textContent=total?`第 ${relationshipPage*pageSize+1}—${Math.min((relationshipPage+1)*pageSize,total)} 位 / 共 ${total} 位`:'当前筛选无关系';
    byId('relationship-prev').disabled=relationshipPage===0;byId('relationship-next').disabled=(relationshipPage+1)*pageSize>=total;
    const root=byId('graph-transform');root.replaceChildren();
    const definitions=svgElement('defs',{});root.append(definitions);
    if(focus){const center=svgElement('g',{class:'focus-node'});center.append(svgElement('rect',{x:415,y:231,width:170,height:108,rx:18}),svgElement('text',{x:500,y:277},focus.name.length>7?focus.name.slice(0,6)+'…':focus.name),svgElement('text',{x:500,y:309,class:'focus-node-note'},'当前阅读中心'));root.append(center);}
    const mobile=byId('mobile-relations');mobile.replaceChildren();
    shown.forEach((group,index)=>{
      const c=group.character,left=index%2===0,row=Math.floor(index/2),x=left?20:740,y=45+row*190,tags=relationshipTags(group.records),models=tagModels(group.records),types=combinedTypes(group.records);
      const selected=c.id===relatedPerson,edge=paintRelation(svgElement('path',{class:`relationship-wire${selected?' selected':''}`,d:left?`M415 285 C350 285 350 ${y+57} 260 ${y+57}`:`M585 285 C650 285 650 ${y+57} 740 ${y+57}`,'data-person-id':c.id}),types),wireTypes=relationshipType==='all'?types:[relationshipType];
      if(wireTypes.length>1){const id=`relation-gradient-${index}`,gradient=svgElement('linearGradient',{id,gradientUnits:'userSpaceOnUse',x1:left?260:585,y1:0,x2:left?415:740,y2:0});wireTypes.forEach((code,i)=>{for(const offset of [i/wireTypes.length,(i+1)/wireTypes.length])gradient.append(svgElement('stop',{offset:`${offset*100}%`,'stop-color':relationshipTypeIndex.get(code).color}));});definitions.append(gradient);edge.style.stroke=`url(#${id})`;}
      root.prepend(edge);
      const lx=left?337:663,ly=(285+y+57)/2,visibleTags=tags.length>2?[tags[0],tags.at(-1)]:tags,extra=tags.length-visibleTags.length,lh=visibleTags.length*25+12+(extra?18:0);
      const edgeLabel=paintRelation(svgElement('g',{class:`relationship-edge-label${selected?' selected':''}`,role:'button',tabindex:0,'aria-label':`${focus.name}与${c.name}：${tags.join('、')}`,'data-person-id':c.id,'data-relation-tags':JSON.stringify(tags)}),types);
      edgeLabel.append(svgElement('rect',{x:lx-73,y:ly-lh/2,width:146,height:lh,rx:9}));visibleTags.forEach((tag,i)=>edgeLabel.append(paintRelation(svgElement('text',{x:lx,y:ly-lh/2+25+i*25,class:tag.length>6?'edge-label-long':''},compact(tag,8)),models.find(model=>model.text===tag).types)));if(extra)edgeLabel.append(svgElement('text',{x:lx,y:ly+lh/2-7,class:'edge-label-extra'},`另 ${extra} 种关系`));edgeLabel.append(svgElement('title',{},tags.join('；')));edgeLabel.addEventListener('click',()=>inspectRelationship(c.id));edgeLabel.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();inspectRelationship(c.id);}});root.append(edgeLabel);
      const node=paintRelation(svgElement('g',{class:`relation-node${selected?' selected':''}`,role:'button',tabindex:0,'aria-label':`查看与${c.name}的关系：${tags.join('、')}`,'data-person-id':c.id}),types);
      node.append(svgElement('rect',{x,y,width:240,height:115,rx:14}),svgElement('text',{x:x+120,y:y+31},compact(c.name,9)),svgElement('text',{x:x+120,y:y+61,class:'relation-node-note'},visibleTags[0]),svgElement('text',{x:x+120,y:y+82,class:'relation-node-note'},visibleTags[1]?(visibleTags[1]+(extra?` +${extra}`:'')):''),svgElement('text',{x:x+120,y:y+105,class:'relation-node-count'},`${group.records.length} 条记录 · 查看 →`),svgElement('title',{},c.name+'：'+group.records.map(readableLabel).join('；')));
      [...node.querySelectorAll('.relation-node-note')].forEach((text,i)=>paintRelation(text,models.find(model=>model.text===visibleTags[i])?.types||types));
      node.addEventListener('click',()=>inspectRelationship(c.id));node.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();inspectRelationship(c.id);}});root.append(node);
      const card=paintRelation(element('button',undefined,`mobile-relation${selected?' selected':''}`),types);card.dataset.personId=c.id;card.dataset.relationTags=JSON.stringify(tags);card.setAttribute('aria-label',`查看与${c.name}的关系：${tags.join('、')}`);card.append(element('strong',c.name),tagList(group.records),element('em',`${group.records.length} 条记录 · 查看关系 →`));card.addEventListener('click',()=>inspectRelationship(c.id));mobile.append(card);
    });
    byId('relationship-graph').parentElement.hidden=total===0;
    byId('relationship-empty').hidden=total>0;
    const biography=byId('focus-biography-content');biography.replaceChildren();if(focus){paragraph(biography,focus.description);referenceButtons(biography,focus);}
  }
  for(const [id,delta]of [['relationship-prev',-1],['relationship-next',1]])byId(id).addEventListener('click',()=>{relationshipPage+=delta;relatedPerson=null;renderGraph();renderCharacter();});
  function renderCharacter(){
    const root=byId('character-detail');root.replaceChildren();
    const group=neighborGroups().find(g=>g.character.id===relatedPerson),focus=personIndex.get(person);
    if(!group||!focus){paragraph(root,'选择一位关联人物，查看关系的变化与原文证据。','muted');return;}
    const other=group.character;
    paragraph(root,'关系档案','kicker');root.append(element('h3',`${focus.name} ↔ ${other.name}`,'relationship-inspector-title'));
    paragraph(root,`${group.records.length} 条有出处的关系记录；逐条展开阅读。`,'relationship-inspector-subtitle');
    root.append(tagList(group.records));
    const refocus=element('button',`以${other.name}为中心继续探索`,'refocus-person');refocus.addEventListener('click',()=>{byId('person-search').value='';selectPerson(other.id);});root.append(refocus);
    const bio=element('details',undefined,'inspector-bio');bio.append(element('summary',`${other.name}的人物小传`));paragraph(bio,other.description);if(other.aliases.length)paragraph(bio,`别名：${other.aliases.join('、')}`);referenceButtons(bio,other);root.append(bio);
    const sourceOrder=r=>Math.min(...r.evidence.map(e=>sources.findIndex(s=>s.id===e.paragraph_id)));
    for(const [i,r]of [...group.records].sort((a,b)=>sourceOrder(a)-sourceOrder(b)).entries()){
      const record=element('details',undefined,'relationship-record');record.dataset.relationshipId=r.id;record.open=i===0;
      const heading=element('summary');const titles=locationTitles(r);heading.append(element('span',titles.slice(0,3).join(' / ')+(titles.length>3?` 等 ${titles.length} 个出处分节`:''),'record-locator'),element('span',compact(readableLabel(r),55)));record.append(heading);
      record.dataset.relationTypes=JSON.stringify(recordTypes(r));record.append(tagList([r]));badges(record,r);paragraph(record,`${personIndex.get(r.from).name} → ${personIndex.get(r.to).name}`,'record-direction');paragraph(record,r.label);referenceButtons(record,r);root.append(record);
    }
  }
