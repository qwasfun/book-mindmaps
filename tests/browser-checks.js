async page => {
  const assert=(value,message)=>{if(!value)throw new Error(message);};
  const origin=new URL(page.url()).origin,errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(origin+'/'))external.push(r.url());});
  await page.setViewportSize({width:1440,height:1000});
  const response=await page.goto(origin+'/'),standalone=await response.text();
  await page.evaluate(()=>localStorage.clear());await page.reload();
  const fixture=await page.evaluate(()=>({source_sha256:DATA.book.source.sha256,overview:DATA.analysis.overview,themes:DATA.analysis.themes,characters:DATA.analysis.characters,relationships:DATA.analysis.relationships,events:DATA.analysis.events,sources:DATA.sources.length}));
  assert(await page.locator('iframe').count()===0,'阅读页仍依赖大图 iframe');
  assert(await page.locator('#overview-categories button').count()===fixture.overview.length,'总览目录遗漏分组');
  const flatten=nodes=>nodes.flatMap(n=>[n.id,...flatten(n.children)]);
  let overviewNodes=0;
  for(const group of fixture.overview){
    await page.locator(`[data-overview-group="${group.id}"]`).click();
    assert(await page.locator('#overview-group-title').textContent()===group.label,'总览分组标题错误');
    const expected=flatten(group.children.length?group.children:[group]);
    const rendered=await page.locator('[data-overview-node]').evaluateAll(nodes=>nodes.map(n=>n.dataset.overviewNode));
    assert(expected.length===rendered.length&&expected.every(id=>rendered.includes(id)),'总览分组遗漏原有层级：'+group.label);overviewNodes+=expected.length;
  }
  const firstGroup=fixture.overview[0];await page.locator(`[data-overview-group="${firstGroup.id}"]`).click();
  const stageCount=await page.locator('#overview-content>.story-stage').count();
  if(await page.locator('.event-preview').count()){
    const eventId=await page.locator('.event-preview').first().getAttribute('data-event-id');await page.locator('.event-preview').first().click();assert(await page.locator('#timeline').isVisible(),'阶段事件未跳转时间线');assert(await page.locator(`.event[data-event-id="${eventId}"]`).isVisible(),'跳转事件缺失');
    await page.getByRole('tab',{name:'全书总览',exact:true}).click();
    const firstStage=await page.locator('.story-stage').first().getAttribute('data-overview-node'),stage=firstGroup.children.find(n=>n.id===firstStage),range=stage?.label.match(/^第(\d+)[—–－-](\d+)回/);
    if(range&&await page.locator('#event-phase').count()){
      await page.locator('.stage-actions button').first().click();assert(await page.locator('#event-phase').inputValue()===`${range[1]}-${range[2]}`,'阶段范围未传入时间线');
      const expected=fixture.events.filter(e=>{const ch=Number(e.title.match(/^第(\d+)回/)?.[1]);return ch>=Number(range[1])&&ch<=Number(range[2]);});
      assert(await page.locator('.event').count()===expected.length,'阶段事件范围遗漏或串章');
      await page.locator('#event-phase').selectOption('0-100');await page.getByRole('tab',{name:'全书总览',exact:true}).click();
    }
  }
  if(await page.locator('#event-phase').count())for(const stage of firstGroup.children){
    const range=stage.label.match(/^第(\d+)[—–－-](\d+)回/);if(!range)continue;
    const card=page.locator(`[data-overview-node="${stage.id}"]`);if((await card.getAttribute('open'))===null)await card.locator('summary').first().click();
    await card.locator('.stage-actions button').click();const expected=fixture.events.filter(e=>{const ch=Number(e.title.match(/第(\d+)回/)?.[1]);return ch>=Number(range[1])&&ch<=Number(range[2]);});
    const actual=await page.locator('.event').evaluateAll(nodes=>nodes.map(n=>n.dataset.eventId));assert(actual.length===expected.length&&expected.every(e=>actual.includes(e.id)),'阶段跳转遗漏正文或补删对照：'+stage.label);
    await page.locator('#event-phase').selectOption('0-100');await page.getByRole('tab',{name:'全书总览',exact:true}).click();
  }
  const evidenceDetails=page.locator('.stage-evidence').first();if(await evidenceDetails.count()){
    await evidenceDetails.locator('summary').click();const quote=await evidenceDetails.locator('blockquote').first().textContent();await evidenceDetails.getByRole('button',{name:'查看引用与定位',exact:true}).first().click();
    assert(await page.locator('#evidence-dialog').isVisible(),'总览引用弹窗未打开');assert(await page.locator('#dialog-source-detail blockquote').textContent()===quote,'总览引用跳转内容错位');
    await page.locator('#dialog-source-detail button').click();assert(await page.locator('.source-full[open]').count()===1,'总览不能跳到原文定位');
  }
  await page.getByRole('tab',{name:'主题意象',exact:true}).click();
  assert(await page.locator('.theme-choice').count()===fixture.themes.length,'主题目录遗漏');
  let themeQuotes=0;
  for(const theme of fixture.themes){
    await page.locator(`.theme-choice[data-theme-id="${theme.id}"]`).click();
    assert(await page.locator('.theme-title').textContent()===theme.title,'主题标题错位');
    assert(await page.locator('.theme-thesis p').last().textContent()===theme.description,'核心读法发生变化');
    const quotes=await page.locator('#theme-content blockquote').allTextContents();assert(quotes.length===theme.evidence.length&&quotes.every((q,i)=>q===theme.evidence[i].quote),'主题引用遗漏或错位');themeQuotes+=quotes.length;
    assert(await page.locator('#theme-content .reading-evidence:visible').count()===Math.min(3,quotes.length),'引用未分层显示');
    if(quotes.length>3){await page.locator('.theme-more-evidence').click();assert(await page.locator('#theme-content .reading-evidence:visible').count()===quotes.length,'更多引用未完整展开');await page.locator('.theme-more-evidence').click();}
    if(theme.alternative_readings.length){await page.locator('.theme-alternatives summary').click();assert(JSON.stringify(await page.locator('.theme-alternatives li').allTextContents())===JSON.stringify(theme.alternative_readings),'其他读法遗漏或改写');await page.locator('.theme-alternatives summary').click();}
  }
  if(fixture.themes.length){
    const firstTheme=fixture.themes[0];await page.getByRole('button',{name:firstTheme.title,exact:true}).click();
    await page.locator('#theme-search').fill(firstTheme.evidence[0]?.quote.slice(0,3)||firstTheme.title.slice(0,2));assert(await page.getByRole('button',{name:firstTheme.title,exact:true}).count()===1,'原文关键词检索未命中主题');
    await page.locator('#theme-search').fill('完全不会命中的主题检索字符串XYZ');assert(await page.locator('.theme-choice').count()===0,'主题空结果错误');assert((await page.locator('#theme-content').textContent()).includes('没有匹配'),'主题空结果缺少指引');await page.locator('#theme-search').fill('');
    if(fixture.themes.length>1){await page.locator('#theme-next').click();assert(await page.locator('.theme-title').textContent()===fixture.themes[1].title,'下一个主题切换失败');await page.reload();assert(await page.locator('#themes').isVisible(),'主题页状态未保留');assert(await page.locator('.theme-title').textContent()===fixture.themes[1].title,'所选主题未保留');await page.locator('#theme-prev').click();}
    await page.locator('#theme-content .reading-evidence button').first().click();assert(await page.locator('#evidence-dialog').isVisible(),'主题引用未打开');await page.keyboard.press('Escape');
    const eventJump=page.locator('#theme-content .evidence-actions button').filter({hasText:'在时间线中阅读'}).first();if(await eventJump.count()){await eventJump.click();assert(await page.locator('#timeline').isVisible(),'主题事件背景跳转失败');}
  }
  await page.getByRole('tab',{name:'人物关系',exact:true}).click();
  const names=await page.locator('#people button').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label')));assert(names.length===fixture.characters.length,'人物列表遗漏');
  for(const name of names){await page.locator('#people').getByRole('button',{name,exact:true}).click();assert(await page.locator('#focus-name').textContent()===name,'人物切换失败：'+name);}
  const visited=new Set(),records=new Set();
  if(fixture.characters.length){
    const first=fixture.characters[0];await page.locator('#people').getByRole('button',{name:first.name,exact:true}).click();
    while(true){
      const ids=await page.locator('.relation-node').evaluateAll(nodes=>nodes.map(n=>n.dataset.personId));
      assert(ids.length<=6,'关系图超过六位人物');assert(await page.locator('.relationship-wire').count()===ids.length,'同对人物连线未合并');assert(await page.locator('.relationship-edge-label').count()===ids.length,'连线缺少关系标注');
      const overlap=await page.locator('#relationship-graph').evaluate(svg=>{const nodes=[...svg.querySelectorAll('.relation-node rect,.focus-node rect')].map(n=>n.getBoundingClientRect());return [...svg.querySelectorAll('.relationship-edge-label rect')].some(label=>{const box=label.getBoundingClientRect();return nodes.some(n=>Math.min(n.right,box.right)>Math.max(n.left,box.left)&&Math.min(n.bottom,box.bottom)>Math.max(n.top,box.top));});});assert(!overlap,'关系标签遮挡人物卡片');
      for(const [i,id] of ids.entries()){
        assert(!visited.has(id),'分页人物重复');visited.add(id);
        const relations=fixture.relationships.filter(r=>(r.from===first.id&&r.to===id)||(r.to===first.id&&r.from===id));
        const expectedTags=[...new Set(relations.map(r=>{if(r.short_label)return r.short_label;const text=r.label.replace(/^第\d+(?:[—－-]\d+)?回(?:所见)?[：:、]?\s*/,'');return text.length>10?text.slice(0,10)+'…':text;}))];
        const edge=page.locator(`.relationship-edge-label[data-person-id="${id}"]`),mobile=page.locator(`.mobile-relation[data-person-id="${id}"]`);
        assert(JSON.stringify(JSON.parse(await edge.getAttribute('data-relation-tags')))===JSON.stringify(expectedTags),'连线关系标签与分析不一致');assert(JSON.stringify(await mobile.locator('.short-relationship-tag').allTextContents())===JSON.stringify(expectedTags),'手机关系标签与分析不一致');
        const displayed=expectedTags.length>2?[expectedTags[0],expectedTags.at(-1)]:expectedTags;assert(JSON.stringify(await edge.locator('text:not(.edge-label-extra)').allTextContents())===JSON.stringify(displayed.map(t=>t.length>8?t.slice(0,8)+'…':t)),'连线未显示主要关系标签');
        if(i===0)await edge.press('Enter');else await page.locator(`.relation-node[data-person-id="${id}"]`).click();
        for(const record of await page.locator('.relationship-record').evaluateAll(nodes=>nodes.map(n=>n.dataset.relationshipId)))records.add(record);
      }
      if(await page.locator('#relationship-next').isDisabled())break;await page.locator('#relationship-next').click();
    }
    const expected=fixture.relationships.filter(r=>r.from===first.id||r.to===first.id);assert(records.size===expected.length&&expected.every(r=>records.has(r.id)),'关系分页丢失记录');await page.locator('#people').getByRole('button',{name:first.name,exact:true}).click();
    const typeCodes=['marriage','family','service','affair','social','power','conflict','other'];
    const typesOf=r=>r.relationship_types?.length?r.relationship_types:['other'];
    const palette=await page.locator('.relationship-type-filter:not([data-relationship-type="all"])').evaluateAll(nodes=>nodes.map(n=>({type:n.dataset.relationshipType,color:getComputedStyle(n).color})));
    assert(palette.length===8&&new Set(palette.map(p=>p.color)).size===8,'八种关系类型未使用不同颜色');
    for(const code of typeCodes){
      await page.locator(`[data-relationship-type="${code}"]`).click();assert(await page.locator(`[data-relationship-type="${code}"]`).getAttribute('aria-pressed')==='true','类型筛选未选中');
      const expectedType=expected.filter(r=>typesOf(r).includes(code)),actualType=new Set(),actualPeople=new Set();
      while(true){
        const ids=await page.locator('.relation-node').evaluateAll(nodes=>nodes.map(n=>n.dataset.personId));
        for(const id of ids){actualPeople.add(id);await page.locator(`.relation-node[data-person-id="${id}"]`).click();const shown=await page.locator('.relationship-record').evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.relationshipId,types:JSON.parse(n.dataset.relationTypes)})));assert(shown.every(r=>r.types.includes(code)),'关系详情混入其他类型');shown.forEach(r=>actualType.add(r.id));}
        if(await page.locator('#relationship-next').isDisabled())break;await page.locator('#relationship-next').click();
      }
      assert(actualType.size===expectedType.length&&expectedType.every(r=>actualType.has(r.id)),'类型筛选遗漏或串入关系：'+code);
      const expectedPeople=new Set(expectedType.map(r=>r.from===first.id?r.to:r.from));assert(actualPeople.size===expectedPeople.size,'类型筛选的关联人物数错误');
      if(!expectedType.length)assert(await page.locator('#relationship-empty').isVisible(),'空类型缺少具体提示');
    }
    const retainedType=typeCodes.find(code=>expected.some(r=>typesOf(r).includes(code)))||'other';
    await page.locator(`[data-relationship-type="${retainedType}"]`).press('Enter');await page.reload();assert(await page.locator('#characters').isVisible(),'类型筛选后未保留人物页');assert(await page.locator(`[data-relationship-type="${retainedType}"]`).getAttribute('aria-pressed')==='true','刷新后未保留关系类型');
    const retainedRecords=expected.filter(r=>typesOf(r).includes(retainedType));
    if(retainedRecords.length){const section=await page.evaluate(pid=>DATA.sources.find(s=>s.id===pid).section_id,retainedRecords[0].evidence[0].paragraph_id);await page.locator('#relationship-section').selectOption(section);await page.locator('#relationship-kind').selectOption('fact');const shown=await page.locator('.relationship-record').evaluateAll(nodes=>nodes.map(n=>n.dataset.relationshipId));assert(await page.evaluate(({ids,section,type})=>ids.every(id=>{const r=DATA.analysis.relationships.find(r=>r.id===id);return r.classification==='fact'&&(r.relationship_types||['other']).includes(type)&&r.evidence.some(e=>DATA.sources.find(s=>s.id===e.paragraph_id).section_id===section);}),{ids:shown,section,type:retainedType}),'类型、性质与章节联合筛选失效');}
    await page.locator('#relationship-reset').click();assert(await page.locator('#rel-type-all').getAttribute('aria-pressed')==='true'&&await page.locator('#relationship-section').inputValue()==='all'&&await page.locator('#relationship-kind').inputValue()==='all','重置未清除全部筛选');
    if(expected.some(r=>typesOf(r).includes('marriage'))){await page.locator('#rel-type-marriage').click();await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'output/playwright/characters-marriage-1440.png',fullPage:true});await page.locator('#relationship-reset').click();}
  }
  await page.getByRole('tab',{name:'双时间线',exact:true}).click();
  if(await page.locator('#event-phase').count())await page.locator('#event-phase').selectOption('0-100');
  assert(await page.locator('.event').count()===fixture.events.length,'全书时间线遗漏');await page.locator('#order-story').click();await page.reload();assert(await page.locator('#order-story').getAttribute('aria-pressed')==='true','时间顺序未保存');
  const widths=[375,768,1440];
  for(const width of widths){
    await page.setViewportSize({width,height:1000});
    for(const tab of ['全书总览','人物关系','双时间线','主题意象','原文出处']){await page.getByRole('tab',{name:tab,exact:true}).click();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),`${width}px ${tab} 横向溢出`);}
    await page.getByRole('tab',{name:'人物关系',exact:true}).click();if(width<1180)assert(await page.locator('.mobile-relations .short-relationship-tag:visible').count()>0,'手机上未直接显示关系标签');await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`output/playwright/characters-colored-${width}.png`,fullPage:true});
    if(width===375){assert(await page.locator('#rel-type-marriage').evaluate(e=>e.getBoundingClientRect().height)>=44,'手机类型按钮过小');await page.locator('#rel-type-marriage').click();await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'output/playwright/characters-marriage-375.png',fullPage:true});await page.locator('#relationship-reset').click();}
    await page.getByRole('tab',{name:'全书总览',exact:true}).click();if((await page.locator('#overview-path-picker').getAttribute('open'))===null)await page.locator('#overview-path-title').click();await page.locator(`[data-overview-group="${firstGroup.id}"]`).click();
    assert(await page.locator('.stage-title').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize))>=16,'阶段文字过小');await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`output/playwright/overview-native-${width}.png`,fullPage:true});
    await page.getByRole('tab',{name:'主题意象',exact:true}).click();
    if(width===375){assert(await page.locator('#theme-picker').getAttribute('open')===null,'手机主题目录未收起');await page.locator('#theme-picker-title').click();await page.locator('#theme-search').fill('');const choice=page.locator('.theme-choice').nth(Math.min(1,fixture.themes.length-1));const id=await choice.getAttribute('data-theme-id');await choice.click();assert(await page.locator('#theme-picker').getAttribute('open')===null,'选择主题后目录未收起');assert(await page.locator('#theme-content').getAttribute('data-theme-id')===id,'手机主题切换失败');}
    await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`output/playwright/themes-native-${width}.png`,fullPage:true});
    if(fixture.themes.length){await page.locator('#theme-content .reading-evidence button').first().click();assert(await page.evaluate(()=>document.querySelector('#evidence-dialog').getBoundingClientRect().width<=innerWidth),'引用弹窗超出屏幕');await page.keyboard.press('Escape');}
  }
  await page.goto(origin+'/themes.html');assert(await page.locator('#themes').isVisible(),'独立主题 HTML 未打开主题');
  await page.goto(origin+'/overview.html');assert(await page.locator('#overview').isVisible(),'独立总览 HTML 未打开总览');
  await page.goto(origin+'/?view=themes');assert(await page.locator('#themes').isVisible(),'主题直达链接失效');await page.goto(origin+'/');
  await page.context().route(origin+'/',route=>route.fulfill({status:200,contentType:'text/html',body:standalone}));await page.context().setOffline(true);await page.reload();
  await page.getByRole('tab',{name:'全书总览',exact:true}).click();await page.locator(`[data-overview-group="${firstGroup.id}"]`).click();assert(await page.locator('.story-stage').count()>0,'离线总览不可读');
  await page.getByRole('tab',{name:'主题意象',exact:true}).click();assert(await page.locator('.theme-title').isVisible(),'离线主题不可读');if(fixture.themes.length>1){const direction=await page.locator('#theme-next').isEnabled()?'#theme-next':'#theme-prev';await page.locator(direction).click();assert(await page.locator('.theme-title').isVisible(),'离线主题切换失败');}
  await page.getByRole('tab',{name:'人物关系',exact:true}).click();await page.locator('#people').getByRole('button',{name:fixture.characters[0].name,exact:true}).click();assert(await page.locator('#focus-name').textContent()===fixture.characters[0].name,'离线人物交互失败');await page.context().setOffline(false);
  assert(errors.length===0,'浏览器错误：'+errors.join(';'));assert(external.length===0,'页面请求了外部资源：'+external.join(';'));
  return {ok:true,url:origin,source_sha256:fixture.source_sha256,characters:fixture.characters.length,relationships:fixture.relationships.length,events:fixture.events.length,themes:fixture.themes.length,referenced_paragraphs:fixture.sources,overview_groups:fixture.overview.length,overview_nodes:overviewNodes,story_stages:stageCount,theme_quotes:themeQuotes,selected_person_neighbors:visited.size,viewports:widths,checks:['原生总览全部层级完整','阶段事件与时间线联动','总览及主题引用弹窗与出处跳转','全部主题正文与其他读法未改写','全部主题引用匹配与分层展开','主题关键词搜索及空结果','主题切换与状态恢复','全部人物与关系分页回归','八类独立颜色','逐类型完整分页筛选','类型性质章节联合筛选','刷新保留与一键重置','手机44px类型按钮','双时间线回归','手机目录收起及可读字号','三种宽度五个视图无横向溢出','独立HTML与直达链接','离线交互及零外部请求'],console_errors:errors,external_requests:external};
}
