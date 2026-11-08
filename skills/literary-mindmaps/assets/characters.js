  // One edge per pair, at most six neighbors: no full-book hairball.
  const personIndex=new Map(analysis.characters.map(c=>[c.id,c]));
  const personPosition=new Map(analysis.characters.map((c,i)=>[c.id,i]));
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
  function filteredRelationships(){const classification=byId('relationship-kind').value,section=byId('relationship-section').value;return analysis.relationships.filter(r=>(r.from===person||r.to===person)&&(classification==='all'||r.classification===classification)&&(section==='all'||r.evidence.some(e=>sourceIndex.get(e.paragraph_id)?.section_id===section)));}
  function neighborGroups(){const groups=new Map();for(const r of filteredRelationships()){const id=r.from===person?r.to:r.from;if(!groups.has(id))groups.set(id,{character:personIndex.get(id),records:[]});groups.get(id).records.push(r);}return [...groups.values()].sort((a,b)=>b.records.length-a.records.length||personPosition.get(a.character.id)-personPosition.get(b.character.id));}
  function locationTitles(record){return [...new Set(record.evidence.map(e=>sourceIndex.get(e.paragraph_id)?.section_title).filter(Boolean))];}
  function readableLabel(record){return record.label.replace(/^第\d+(?:[—－-]\d+)?回(?:所见)?[：:、]?\s*/,'');}
  function compact(text,size){return text.length>size?text.slice(0,size)+'…':text;}
  function renderPeople(){const query=byId('person-search').value.trim().toLocaleLowerCase();const shown=analysis.characters.filter(c=>[c.name,...c.aliases].some(n=>n.toLocaleLowerCase().includes(query))).sort((a,b)=>degree(b.id)-degree(a.id)||personPosition.get(a.id)-personPosition.get(b.id));const root=byId('people');root.replaceChildren();for(const c of shown){const button=element('button');button.setAttribute('aria-label',c.name);button.setAttribute('aria-pressed',String(c.id===person));button.append(element('span',c.name),element('span',`${degree(c.id)} 位关联`,'person-degree'));button.addEventListener('click',()=>selectPerson(c.id));root.append(button);}byId('people-count').textContent=`${shown.length} / ${analysis.characters.length} 人 · 按关联人数排列`;if(!shown.length)paragraph(root,'没有匹配的人物，试试别名。','muted');}
  function selectPerson(id){if(!personIndex.has(id))return;person=id;relatedPerson=null;relationshipPage=0;renderPeople();renderGraph();renderCharacter();if(pickerMedia.matches)picker.open=false;save();}
  byId('person-search').addEventListener('input',renderPeople);
  for(const id of ['relationship-kind','relationship-section'])byId(id).addEventListener('change',()=>{relationshipPage=0;relatedPerson=null;renderGraph();renderCharacter();});
  const svgNS='http://www.w3.org/2000/svg';
  function svgElement(tag,attrs,text){const e=document.createElementNS(svgNS,tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,String(v));if(text!==undefined)e.textContent=text;return e;}
  function inspectRelationship(id){relatedPerson=id;renderGraph();renderCharacter();if(matchMedia('(max-width:1180px)').matches)byId('character-detail').scrollIntoView({behavior:'smooth',block:'start'});}
  function renderGraph(){
    const groups=neighborGroups(),focus=personIndex.get(person),total=groups.length;
    relationshipPage=Math.max(0,Math.min(relationshipPage,Math.ceil(total/pageSize)-1));
    const shown=groups.slice(relationshipPage*pageSize,(relationshipPage+1)*pageSize);
    if(!shown.some(g=>g.character.id===relatedPerson))relatedPerson=shown[0]?.character.id||null;
    byId('picker-current').textContent=focus?`当前人物：${focus.name}`:'选择人物';
    byId('focus-name').textContent=focus?.name||'暂无人物';
    byId('focus-count').textContent=`${total} 位直接相关人物 · ${groups.reduce((n,g)=>n+g.records.length,0)} 条关系记录`;
    byId('relationship-pagination').textContent=total?`第 ${relationshipPage*pageSize+1}—${Math.min((relationshipPage+1)*pageSize,total)} 位 / 共 ${total} 位`:'当前筛选无关系';
    byId('relationship-prev').disabled=relationshipPage===0;byId('relationship-next').disabled=(relationshipPage+1)*pageSize>=total;
    const root=byId('graph-transform');root.replaceChildren();
    if(focus){const center=svgElement('g',{class:'focus-node'});center.append(svgElement('rect',{x:405,y:231,width:190,height:108,rx:18}),svgElement('text',{x:500,y:277},focus.name.length>7?focus.name.slice(0,6)+'…':focus.name),svgElement('text',{x:500,y:309,class:'focus-node-note'},'当前阅读中心'));root.append(center);}
    const mobile=byId('mobile-relations');mobile.replaceChildren();
    shown.forEach((group,index)=>{
      const c=group.character,left=index%2===0,row=Math.floor(index/2),x=left?30:710,y=45+row*190;
      const selected=c.id===relatedPerson,edge=svgElement('path',{class:`relationship-wire${selected?' selected':''}`,d:left?`M405 285 C350 285 360 ${y+50} 290 ${y+50}`:`M595 285 C650 285 640 ${y+50} 710 ${y+50}`});root.prepend(edge);
      const node=svgElement('g',{class:`relation-node${selected?' selected':''}`,role:'button',tabindex:0,'aria-label':`查看与${c.name}的关系`,'data-person-id':c.id});
      node.append(svgElement('rect',{x,y,width:260,height:115,rx:14}),svgElement('text',{x:x+130,y:y+35},compact(c.name,10)),svgElement('text',{x:x+130,y:y+66,class:'relation-node-note'},compact(readableLabel(group.records[0]),14)),svgElement('text',{x:x+130,y:y+94,class:'relation-node-count'},`${group.records.length} 条记录 · 查看 →`),svgElement('title',{},c.name+'：'+group.records.map(readableLabel).join('；')));
      node.addEventListener('click',()=>inspectRelationship(c.id));node.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();inspectRelationship(c.id);}});root.append(node);
      const card=element('button',undefined,`mobile-relation${selected?' selected':''}`);card.dataset.personId=c.id;card.setAttribute('aria-label',`查看与${c.name}的关系`);card.append(element('strong',c.name),element('span',compact(readableLabel(group.records[0]),34)),element('em',`${group.records.length} 条记录 · 查看关系 →`));card.addEventListener('click',()=>inspectRelationship(c.id));mobile.append(card);
    });
    if(!total)paragraph(mobile,'没有符合筛选条件的关系，请调整线索性质或出处章节。','relation-empty');
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
    const refocus=element('button',`以${other.name}为中心继续探索`,'refocus-person');refocus.addEventListener('click',()=>{byId('person-search').value='';selectPerson(other.id);});root.append(refocus);
    const bio=element('details',undefined,'inspector-bio');bio.append(element('summary',`${other.name}的人物小传`));paragraph(bio,other.description);if(other.aliases.length)paragraph(bio,`别名：${other.aliases.join('、')}`);referenceButtons(bio,other);root.append(bio);
    const sourceOrder=r=>Math.min(...r.evidence.map(e=>sources.findIndex(s=>s.id===e.paragraph_id)));
    for(const [i,r]of [...group.records].sort((a,b)=>sourceOrder(a)-sourceOrder(b)).entries()){
      const record=element('details',undefined,'relationship-record');record.dataset.relationshipId=r.id;record.open=i===0;
      const heading=element('summary');const titles=locationTitles(r);heading.append(element('span',titles.slice(0,3).join(' / ')+(titles.length>3?` 等 ${titles.length} 个出处分节`:''),'record-locator'),element('span',compact(readableLabel(r),55)));record.append(heading);
      badges(record,r);paragraph(record,`${personIndex.get(r.from).name} → ${personIndex.get(r.to).name}`,'record-direction');paragraph(record,r.label);referenceButtons(record,r);root.append(record);
    }
  }
