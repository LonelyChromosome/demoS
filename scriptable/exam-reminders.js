// Direct algorithm port of DemoF3 ExamReminderPlanner.kt and AssistantText.kt.
function examHash(text) {return sha256Raw(unescape(encodeURIComponent(text)));}
function examLocalTime(text) {
  const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(text);
  if(!m)return null;
  const d=new Date(+m[1],+m[2]-1,+m[3],+m[4],+m[5]);
  return d.getFullYear()===+m[1]&&d.getMonth()===+m[2]-1&&d.getDate()===+m[3]&&d.getHours()===+m[4]&&d.getMinutes()===+m[5]?d:null;
}
function examReminderPlan(semester,nowMillis,scheduled=new Set(),delivered=new Set()) {
  const candidates=[],today=new Date(nowMillis);today.setHours(12,0,0,0);
  for(const subject of semester.subjects)for(const exam of subject.examSchedules) {
    const start=examLocalTime(exam.startAt),end=examLocalTime(exam.endAt);if(!start||!end||end.getTime()<=nowMillis)continue;
    const identity=[subject.subjectId,exam.id,exam.startAt,exam.endAt,exam.room||'',exam.className||'',exam.examForm||''].join('|');
    const startDay=new Date(start);startDay.setHours(12,0,0,0);
    let daysLeft=0;for(const cursor=new Date(today);cursor<startDay;cursor.setDate(cursor.getDate()+1))daysLeft++;
    if(daysLeft<=0)continue;
    for(const milestone of [7,3,1]) {
      const tierKey=examHash(identity+'|'+milestone);if(delivered.has(tierKey))continue;
      if(daysLeft>milestone) {
        const at=new Date(start);at.setDate(at.getDate()-milestone);at.setHours(9,0,0,0);
        candidates.push({key:examHash('day|'+at.getTime()+'|'+milestone),subjects:[subject.name],daysBefore:milestone,atMillis:at.getTime(),milestoneKeys:[tierKey]});
      }else if(daysLeft===1&&milestone===1||daysLeft>=2&&daysLeft<=3&&milestone===3||daysLeft>=4&&daysLeft<=7&&milestone===7) {
        candidates.push({key:examHash('due|'+daysLeft),subjects:[subject.name],daysBefore:daysLeft,atMillis:nowMillis,milestoneKeys:[tierKey]});
      }
    }
  }
  function grouped(items){const groups=new Map();for(const r of items){const old=groups.get(r.key);if(old){old.subjects=[...new Set([...old.subjects,...r.subjects])];old.milestoneKeys=[...new Set([...old.milestoneKeys,...r.milestoneKeys])];}else groups.set(r.key,{...r});}return [...groups.values()];}
  const future=grouped(candidates.filter(r=>r.atMillis>nowMillis)),due=grouped(candidates.filter(r=>r.atMillis<=nowMillis));
  return {schedule:future.filter(r=>!scheduled.has(r.key)),due,cancel:[...scheduled].filter(k=>!future.some(r=>r.key===k))};
}
function examAssistantText(pack,days,examCount,multiple=false) {
  const useCase=multiple||examCount>1?11:days===1?8:days===7?6:days===3?7:9;
  const texts=BPA_ASSISTANT_CATALOG[pack]||BPA_ASSISTANT_CATALOG.normal;
  const template=texts['U'+useCase]||BPA_ASSISTANT_CATALOG.normal['U'+useCase];
  return useCase===9?template.replace('X',String(days)):useCase===11?template.replace('X',String(days)).replace('N',String(examCount)):template;
}
