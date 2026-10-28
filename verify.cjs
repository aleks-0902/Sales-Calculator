const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
function element(){return {value:'',textContent:'',children:[],attributes:{},style:{},listeners:{},classList:{toggle(){}},append(child){this.children.push(child);},replaceChildren(){this.children=[];},setAttribute(k,v){this.attributes[k]=v;},getAttribute(k){return this.attributes[k];},addEventListener(k,fn){this.listeners[k]=fn;},focus(){},querySelectorAll(selector){return this.children.flatMap(row=>row.children.flatMap(cell=>cell.children)).filter(child=>child.type === 'button' && (!selector || selector === 'button' || child.className === selector.slice(1)));}};}
const elements = new Map();
const get = id => {if(!elements.has(id))elements.set(id,element());return elements.get(id);};
Object.entries({product:'MacBook',price:'8000',cost:'6200',quantity:'12'}).forEach(([k,v])=>get(k).value=v);
const savedData = new Map();
const localStorage = {getItem:key=>savedData.has(key)?savedData.get(key):null,setItem:(key,value)=>savedData.set(key,value)};
const ctx=vm.createContext({localStorage,document:{getElementById:get,createElement:element},Intl,Number});
vm.runInContext(fs.readFileSync('script.js','utf8'),ctx);
const submit = values => {Object.entries({product:'Mouse',price:'100',cost:'60',quantity:'10',...values}).forEach(([k,v])=>get(k).value=String(v));get('calculator').listeners.submit({preventDefault(){}});};
assert.match(get('revenue').textContent,/96,000.00/);assert.equal(get('margin').textContent,'22.50%');
submit({});assert.match(get('revenue').textContent,/97,000.00/);assert.match(get('cost-total').textContent,/75,000.00/);assert.match(get('profit').textContent,/22,000.00/);assert.equal(get('margin').textContent,'22.68%');assert.equal(get('product-rows').children.length,2);
for(const input of [{product:' '},{price:''},{price:-1},{price:'abc'},{cost:-1},{quantity:'foo'},{quantity:1.5},{price:'1.234'},{price:'1e20'}]){submit(input);assert.equal(get('product-rows').children.length,2);assert.match(get('revenue').textContent,/97,000.00/);}
// 重名记录按唯一 ID 删除。
submit({product:'MacBook',price:0,cost:20,quantity:2});assert.equal(get('product-rows').children.length,3);assert.equal(get('product-rows').children[2].children[6].textContent,'—');
get('product-rows').querySelectorAll(".delete-button")[2].listeners.click();assert.equal(get('product-rows').children.length,2);assert.equal(get('product-rows').children[0].children[0].textContent,'MacBook');
while(get('product-rows').children.length)get('product-rows').querySelectorAll(".delete-button")[0].listeners.click();
assert.equal(get('status').textContent,'暂无商品');assert.equal(get('margin').textContent,'—');assert.equal(get('empty-state').hidden,false);assert.match(get('revenue').textContent,/0.00/);
submit({price:0,cost:20,quantity:2});assert.equal(get('status').textContent,'亏损中');assert.equal(get('margin').textContent,'—');
submit({price:.3,cost:.1,quantity:3});assert.equal(vm.runInContext('products[1].profitCents',ctx),60);
submit({product:'<img src=x onerror=alert(1)>'});assert.equal(get('product-rows').children[2].children[0].textContent,'<img src=x onerror=alert(1)>');assert.equal(get('product-rows').children[2].children[0].children.length,0);
get('reset').listeners.click();assert.equal(get('product').value,'MacBook');assert.equal(get('product-rows').children.length,3);
assert.equal(vm.runInContext('summarize([{revenueCents:Number.MAX_SAFE_INTEGER,totalCostCents:0,quantity:0},{revenueCents:1,totalCostCents:0,quantity:0}])',ctx),null);
console.log('Passed: multi-product totals, weighted margin, validation, duplicate-name deletion, empty list, zero revenue, loss, decimal precision, safe text, reset and aggregate overflow.');


// 利润率标签、20% 门槛和异常输入的回归检查。
const clearProducts = () => {while(get('product-rows').children.length)get('product-rows').querySelectorAll(".delete-button")[0].listeners.click();};
for (const [cost, expected, style] of [[80,'Good Profit Margin','margin-good'],[80.01,'Low Profit Margin','margin-low'],[79.99,'Good Profit Margin','margin-good'],[120,'Low Profit Margin','margin-low']]) {
  clearProducts();submit({price:100,cost,quantity:1});
  assert.equal(get('margin-rating').textContent,expected);
  assert.match(get('margin-rating').className,new RegExp(style));
  assert.equal(get('product-rows').children[0].children[6].children[0].textContent,expected);
}
clearProducts();assert.equal(get('margin-rating').textContent,'利润率不适用');
for(const data of [{price:0,cost:0,quantity:1},{price:0,cost:20,quantity:1},{price:100,cost:80,quantity:0}]) {
  clearProducts();submit(data);assert.equal(get('margin').textContent,'—');assert.equal(get('margin-rating').textContent,'利润率不适用');
}
clearProducts();submit({price:100,cost:80,quantity:1});
for(const invalid of [{price:''},{cost:''},{quantity:''},{price:'NaN'},{cost:'Infinity'},{price:'1e309'},{price:'999999999999999999999999'},{quantity:'9007199254740990.1'}]) {
  submit(invalid);assert.equal(get('product-rows').children.length,1);assert.equal(get('margin-rating').textContent,'Good Profit Margin');
}
assert.equal(vm.runInContext('safePercent(1, 0)',ctx),null);
assert.equal(vm.runInContext('safePercent(NaN, 100)',ctx),null);
assert.equal(vm.runInContext('safePercent(Infinity, 100)',ctx),null);
assert.equal(vm.runInContext('percent(NaN)',ctx),'—');
assert.equal(vm.runInContext('percent(Infinity)',ctx),'—');
assert.equal(vm.runInContext('parseCents("70368744177664.01")',ctx),7036874417766401);
console.log('Passed: green/orange thresholds, item and overall badges, zero revenue, empty/invalid input, finite ratios, exact large-amount parsing.');


// 每次创建新的 VM 模拟刷新，复用存储，避免仅验证当前内存。
const storageKey = 'salesStudioProducts';
function session(store, failures = {}) {
  const nodes = new Map();
  const find = id => {if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
  const localStorage = {
    getItem(key){if(failures.read)throw Error('SecurityError');return store.has(key)?store.get(key):null;},
    setItem(key,value){if(failures.write)throw Error('QuotaExceededError');store.set(key,value);}
  };
  const context = vm.createContext({localStorage,document:{getElementById:find,createElement:element},Intl,Number});
  vm.runInContext(fs.readFileSync('script.js','utf8'),context);
  return {find,context,
    items:()=>JSON.parse(vm.runInContext('JSON.stringify(products)',context)),
    add(values={}){Object.entries({product:'Mouse',price:'100',cost:'60',quantity:'10',...values}).forEach(([k,v])=>find(k).value=String(v));find('calculator').listeners.submit({preventDefault(){}});},
    remove(index){find('product-rows').querySelectorAll(".delete-button")[index].listeners.click();}
  };
}
const store = new Map();
let page = session(store);
assert.equal(page.items()[0].product,'MacBook');assert.ok(store.has(storageKey));
page.add();assert.equal(JSON.parse(store.get(storageKey)).products.length,2);
page = session(store);assert.equal(page.items().length,2);assert.match(page.find('revenue').textContent,/97,000.00/);
page.add({product:'MacBook'});assert.equal(new Set(page.items().map(item=>item.id)).size,3);
page.remove(0);page=session(store);assert.equal(page.items().length,2);
while(page.items().length)page.remove(0);
page=session(store);assert.equal(page.items().length,0);assert.equal(page.find('margin').textContent,'—');
page.add();page=session(store);assert.equal(page.items().length,1);
const validRow = {product:'Good',priceCents:10000,costCents:8000,quantity:1};
for(const raw of ['{broken','', 'null', JSON.stringify({version:2,products:[]}),JSON.stringify({version:1,products:{}}),
  ...[{...validRow,product:' '},{...validRow,priceCents:-1},{...validRow,quantity:1.5},{...validRow,costCents:'80'},
    {...validRow,priceCents:1e100},{...validRow,priceCents:Number.MAX_SAFE_INTEGER,quantity:2}].map(item=>JSON.stringify({version:1,products:[item]})),
  JSON.stringify({version:1,products:[{...validRow,priceCents:Number.MAX_SAFE_INTEGER},{...validRow,priceCents:1}]})]) {
  const broken = new Map([[storageKey,raw]]);const fallback=session(broken);
  assert.equal(fallback.items()[0].product,'MacBook');assert.match(fallback.find('storage-status').className,/storage-warning/);assert.equal(broken.get(storageKey),raw);
  fallback.add();assert.equal(JSON.parse(broken.get(storageKey)).products.length,2);
}
const forged = new Map([[storageKey,JSON.stringify({version:1,products:[{...validRow,id:7,profitCents:999999},{...validRow,id:7}]})]]);
page=session(forged);assert.equal(page.items()[0].profitCents,2000);page.add();assert.equal(new Set(page.items().map(item=>item.id)).size,3);
// 写入失败仍允许计算，提示未保存；恢复存储后下次操作会重试。
const failStore = new Map();const failures={write:true};page=session(failStore,failures);
page.add();assert.equal(page.items().length,2);assert.match(page.find('storage-status').className,/storage-warning/);assert.equal(failStore.size,0);
failures.write=false;page.remove(0);assert.equal(JSON.parse(failStore.get(storageKey)).products.length,1);
page=session(new Map(),{read:true,write:true});page.add();assert.equal(page.items().length,2);assert.match(page.find('storage-status').className,/storage-warning/);
// 无效表单不能覆盖存档。
const before=store.get(storageKey);page=session(store);page.add({price:'NaN'});assert.equal(store.get(storageKey),before);
console.log('Passed: first use, reload, add/delete persistence, saved empty list, unique IDs, corrupt/schema/field/overflow data, recalculation, read/write failures, retry and invalid-input storage protection.');


// 排行榜与编辑：独立会话避免改变现有存储测试。
const rankStore = new Map([[storageKey, JSON.stringify({version:1,products:[]})]]);
let rankedPage = session(rankStore);
const names = p => p.find('ranking-rows').children.map(row=>row.children[1].textContent);
rankedPage.add({product:'A',price:100,cost:80,quantity:1}); // 20
rankedPage.add({product:'B',price:50,cost:20,quantity:2}); // 60
rankedPage.add({product:'C',price:40,cost:20,quantity:1}); // 20
rankedPage.add({product:'Loss',price:10,cost:20,quantity:1}); // -10
rankedPage.add({product:'Zero',price:0,cost:0,quantity:1}); // 0
assert.deepEqual(names(rankedPage),['B','A','C','Zero','Loss']);
assert.deepEqual(rankedPage.items().map(item=>item.product),['A','B','C','Loss','Zero']);
assert.equal(rankedPage.find('ranking-rows').children[3].children[3].textContent,'—');
assert.deepEqual(rankedPage.find('ranking-rows').children.map(row=>row.children[0].textContent),['1','2','3','4','5']);
const idsBefore=rankedPage.items().map(item=>item.id);
rankedPage.find('product-rows').querySelectorAll('.edit-button')[2].listeners.click();
assert.equal(rankedPage.find('save-product').textContent,'保存修改');
rankedPage.add({product:'C edited',price:100,cost:0,quantity:1});
assert.equal(rankedPage.items().length,5);assert.deepEqual(rankedPage.items().map(item=>item.id),idsBefore);
assert.deepEqual(names(rankedPage),['C edited','B','A','Zero','Loss']);
rankedPage=session(rankStore);assert.deepEqual(names(rankedPage),['C edited','B','A','Zero','Loss']);
// 编辑回到同利润，保持原明细位置。
rankedPage.find('product-rows').querySelectorAll('.edit-button')[2].listeners.click();
rankedPage.add({product:'C',price:40,cost:20,quantity:1});
assert.deepEqual(names(rankedPage),['B','A','C','Zero','Loss']);
const snapshot=rankStore.get(storageKey);
rankedPage.find('product-rows').querySelectorAll('.edit-button')[0].listeners.click();
rankedPage.add({price:'NaN'});assert.equal(rankStore.get(storageKey),snapshot);assert.deepEqual(names(rankedPage),['B','A','C','Zero','Loss']);
rankedPage.find('cancel-edit').listeners.click();assert.equal(rankStore.get(storageKey),snapshot);
rankedPage.find('product-rows').querySelectorAll('.edit-button')[1].listeners.click();
rankedPage.remove(1);assert.equal(rankedPage.find('save-product').textContent,'＋ 添加到商品列表');assert.deepEqual(names(rankedPage),['A','C','Zero','Loss']);
// 排名防御无效字段，并且不修改传入数组。
assert.equal(vm.runInContext('rankProducts([null, {product:"X",priceCents:NaN,costCents:0,quantity:1}]).length',rankedPage.context),0);
assert.equal(vm.runInContext('rankProducts([{product:"X",priceCents:1,costCents:0,quantity:1,profitCents:NaN}])[0].profitCents',rankedPage.context),1);
while(rankedPage.items().length)rankedPage.remove(0);
assert.equal(rankedPage.find('ranking-empty').hidden,false);assert.equal(rankedPage.find('ranking-rows').children.length,0);
// 替换大金额商品时，不应将旧商品重复累加而误拒绝。
const largeStore=new Map([[storageKey,JSON.stringify({version:1,products:[{product:'Large',priceCents:7036874417766401,costCents:0,quantity:1}]})]]);
rankedPage=session(largeStore);rankedPage.find('product-rows').querySelectorAll('.edit-button')[0].listeners.click();
assert.equal(rankedPage.find('price').value,'70368744177664.01');
rankedPage.find('calculator').listeners.submit({preventDefault(){}});assert.equal(rankedPage.items()[0].priceCents,7036874417766401);assert.equal(rankedPage.find('form-error').textContent,'');
// 修改时写入失败仍更新排名，并显示未保存。
const editFailure={write:false};rankedPage=session(new Map(),editFailure);
rankedPage.find('product-rows').querySelectorAll('.edit-button')[0].listeners.click();editFailure.write=true;
rankedPage.add({product:'Updated',price:100,cost:80,quantity:1});assert.deepEqual(names(rankedPage),['Updated']);assert.match(rankedPage.find('storage-status').className,/storage-warning/);
console.log('Passed: profit ranking, stable ties, source order, loss/zero, edits and IDs, edit validation/cancel/delete, reload, invalid rank data, exact edit refill and edit storage failure.');

// 商业洞察：纯计算、规则建议与页面增删改联动。
const insightStore = new Map([[storageKey,JSON.stringify({version:1,products:[]})]]);
let insightPage = session(insightStore);
const insightData = (p, expression='products') => JSON.parse(vm.runInContext(`JSON.stringify(calculateBusinessInsights(${expression}))`,p.context));
const adviceText = p => p.find('business-advice').children.map(item=>item.textContent).join(' ');
assert.match(insightPage.find('business-profit').textContent,/0\.00/);
assert.equal(insightPage.find('business-margin').textContent,'—');assert.match(adviceText(insightPage),/请先添加/);
insightPage.add({product:'A',price:100,cost:80,quantity:1});
assert.equal(insightPage.find('business-margin').textContent,'20.00%');
assert.equal(insightData(insightPage).lowMarginProducts.length,0);assert.match(adviceText(insightPage),/已达到 20%/);
insightPage.add({product:'B',price:100,cost:90,quantity:2});
insightPage.add({product:'Zero',price:0,cost:5,quantity:1});
let insights = insightData(insightPage);
assert.equal(insights.totals.profitCents,3500);assert.equal(insights.totals.revenueCents,30000);
assert.equal(insightPage.find('business-margin').textContent,'11.67%');
assert.deepEqual(insights.topProducts.map(item=>item.product),['A','B']);
assert.deepEqual(insights.lowMarginProducts.map(item=>item.product),['B']);
assert.deepEqual(insights.zeroRevenueProducts.map(item=>item.product),['Zero']);
assert.match(insightPage.find('business-top-note').textContent,/并列/);
assert.equal(insightPage.find('business-top').children.length,2);
assert.match(insightPage.find('business-zero-note').textContent,/Zero/);
assert.match(adviceText(insightPage),/低于 20%/);
const businessBefore=insightPage.find('business-profit').textContent;
insightPage.add({price:'NaN'});assert.equal(insightPage.find('business-profit').textContent,businessBefore);
insightPage.find('product-rows').querySelectorAll('.edit-button')[1].listeners.click();
insightPage.add({product:'B',price:100,cost:0,quantity:2});
assert.deepEqual(insightData(insightPage).topProducts.map(item=>item.product),['B']);
assert.equal(insightPage.find('business-low').children.length,0);
insightPage.remove(1);assert.deepEqual(insightData(insightPage).topProducts.map(item=>item.product),['A']);
insightPage=session(insightStore);assert.deepEqual(insightData(insightPage).topProducts.map(item=>item.product),['A']);
const inputBefore=JSON.stringify(insightPage.items());insightData(insightPage);assert.equal(JSON.stringify(insightPage.items()),inputBefore);
// 无效原始字段剔除；衍生字段不可信，必须重算。
insights=insightData(insightPage,'[null,{product:"Bad",priceCents:NaN,costCents:0,quantity:1},{product:"Bad",priceCents:1,costCents:-1,quantity:1},{product:"A",priceCents:100,costCents:80,quantity:1,profitCents:99999,totalCostCents:99999}]');
assert.equal(insights.invalidCount,3);assert.equal(insights.totals.profitCents,20);assert.equal(insights.margin,20);
insights=insightData(insightPage,'null');assert.equal(insights.inputInvalid,true);
insights=insightData(insightPage,'[{product:"Big",priceCents:Number.MAX_SAFE_INTEGER,costCents:0,quantity:1},{product:"Extra",priceCents:1,costCents:0,quantity:1}]');
assert.equal(insights.overflow,true);assert.equal(insights.margin,null);
assert.match(vm.runInContext('generateBusinessAdvice(calculateBusinessInsights([{product:"Big",priceCents:Number.MAX_SAFE_INTEGER,costCents:0,quantity:1},{product:"Extra",priceCents:1,costCents:0,quantity:1}])).join(" ")',insightPage.context),/异常/);
// 只渲染洞察，验证防御分支，不绕过主应用的输入/存档校验。
vm.runInContext('products=[null];renderBusinessInsights()',insightPage.context);
assert.equal(insightPage.find('business-profit').textContent,'—');assert.equal(insightPage.find('business-data-note').hidden,false);assert.match(adviceText(insightPage),/修正无效数据/);
vm.runInContext('products=[{product:"Big",priceCents:Number.MAX_SAFE_INTEGER,costCents:0,quantity:1},{product:"Extra",priceCents:1,costCents:0,quantity:1}];renderBusinessInsights()',insightPage.context);
assert.equal(insightPage.find('business-profit').textContent,'—');assert.equal(insightPage.find('business-top').children.length,0);
insightPage=session(new Map([[storageKey,JSON.stringify({version:1,products:[]})]]));
insightPage.add({product:'Loss',price:50,cost:80,quantity:1});
assert.match(adviceText(insightPage),/所有有效商品均亏损/);assert.match(insightPage.find('business-top-note').textContent,/仍为亏损/);
insightPage.remove(0);insightPage.add({product:'Free',price:0,cost:5,quantity:1});
assert.equal(insightPage.find('business-margin').textContent,'—');assert.equal(insightPage.find('business-low').children.length,0);assert.match(adviceText(insightPage),/没有销售收入但已产生成本/);
insightPage.remove(0);insightPage.add({product:'Unsold',price:100,cost:80,quantity:0});
assert.match(adviceText(insightPage),/暂不判断利润率/);
insightPage.remove(0);insightPage.add({product:'<img src=x onerror=alert(1)>',price:100,cost:80,quantity:1});
assert.match(insightPage.find('business-top').children[0].textContent,/<img/);assert.equal(insightPage.find('business-top').children[0].children.length,0);
insightPage.add({product:'<img src=x onerror=alert(1)>',price:100,cost:80,quantity:1});
assert.match(insightPage.find('business-top').children[0].textContent,/明细第 1 条/);assert.match(insightPage.find('business-top').children[1].textContent,/明细第 2 条/);
console.log('Passed: business metrics, weighted margin, 20% boundary, low-margin list, all top ties, zero revenue, empty/invalid/overflow data, pure recomputation, loss-aware advice, safe text, edit/delete/add/reload sync.');
