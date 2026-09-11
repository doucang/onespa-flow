/* B1F1 fixed-price add-on: cents, same allocation and calendar as quote engine.
 * No network, messaging or order mutation. CommonJS export enables fixture parity. */
(function(root, factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  else root.OneSpaRetailRules=api;
})(typeof globalThis!=='undefined'?globalThis:this, function(){
  'use strict';
  const ADDON='b1f1-massage60', NET=12000;
  function integer(v){ return Number.isSafeInteger(v) && v>=0; }
  function fail(code,message){ return {ok:false,code,message}; }
  function allocate(party){
    const {adults,children_3_12:kids,children_0_2:babies}=party;
    if(![adults,kids,babies].every(integer) || adults<1) return fail('invalid_party','请填写完整的成人及儿童年龄档人数。');
    if(adults+kids>=10) return fail('group_required','成人与 3–12 岁儿童合计达 10 人，请走团客流程。');
    let pairs=Math.floor(adults/2), solo=adults%2, child=kids;
    if(solo && child){ pairs++; solo=0; child--; }
    return {ok:true,pairs,solo,child,eligible:adults-solo};
  }
  function tier(date,calendar){
    if(!calendar || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('invalid_date','请填写到店日期。');
    const d=new Date(date+'T00:00:00Z');
    if(Number.isNaN(d.getTime()) || d.toISOString().slice(0,10)!==date) return fail('invalid_date','到店日期无效。');
    if(date<calendar.valid_from || date>calendar.valid_to) return fail('calendar_out_of_range','到店日期超出已核实公假日历，请人工核价。');
    return {ok:true,tier:([5,6].includes(d.getUTCDay()) || Object.hasOwn(calendar.holidays,date))?'we':'wd'};
  }
  function validate({rows,party,date,orderType='instore',config}){
    const addons=rows.filter(r=>r.id===ADDON || r.kind==='b1f1_addon');
    if(!addons.length) return {ok:true,active:false};
    if(!config || config.new_sales_enabled!==true) return fail('sales_disabled','买一送一按摩加购暂未开放录单，请交人工核对。');
    if(orderType!=='instore') return fail('instore_only','该加购只限买一送一到店新单。');
    const a=allocate(party);if(!a.ok)return a;
    const t=tier(date,config.calendar);if(!t.ok)return t;
    if(a.pairs<1) return fail('no_b1f1','该组合没有买一送一成人名额，Solo 按原规则处理。');
    if(rows.some(r=>![ADDON,'twin-'+t.tier,'solo-'+t.tier,'kids-'+t.tier].includes(r.id))) return fail('unsupported_mix','本加购只与本次门票同单；其他项目或跨日期组合请人工核对。');
    if(rows.some(r=>!integer(r.qty)||r.qty<1))return fail('invalid_quantity','项目数量须为正整数。');
    const qty=id=>rows.filter(r=>r.id===id).reduce((n,r)=>n+r.qty,0);
    if(qty('twin-'+t.tier)!==a.pairs || qty('solo-'+t.tier)!==a.solo || qty('kids-'+t.tier)!==a.child) return fail('ticket_allocation_mismatch',`请按人数录入：买一送一 ${a.pairs} 张、Solo ${a.solo} 张、儿童票 ${a.child} 张；0–2 岁仅登记。`);
    const prices={[ADDON]:NET,['twin-'+t.tier]:t.tier==='we'?19900:16900,['solo-'+t.tier]:t.tier==='we'?19900:16900,['kids-'+t.tier]:t.tier==='we'?8800:5800};
    if(rows.some(r=>r.priceCent!==prices[r.id] || r.disc || r._freeTicket || (r.tax && r.tax!==118)))return fail('fixed_price_conflict','本组合按固定价录单，不再打八折、免票或手改价格。');
    if(addons.some(r=>r.kind!=='b1f1_addon' || !['tuina','footclassic','undecided'].includes(r.treatment)))return fail('unsupported_treatment','每份请选择全身、足部，或到店二选一。');
    const massageQty=qty(ADDON);
    if(massageQty>a.eligible)return fail('massage_exceeds_adults',`买一送一覆盖 ${a.eligible} 位成人，最多加 ${a.eligible} 份；Solo 与儿童按摩请人工核对。`);
    const treatmentCounts={tuina:0,footclassic:0,undecided:0};
    addons.forEach(r=>treatmentCounts[r.treatment]+=r.qty);
    const subtotal=rows.reduce((sum,r)=>sum+prices[r.id]*r.qty,0);
    return {ok:true,active:true,eligible:a.eligible,allocation:a,tier:t.tier,massageQty,treatmentCounts,subtotal,total:Math.round(subtotal*118/100),ruleVersion:config.rule_version};
  }
  return {ADDON,NET,allocate,tier,validate};
});
