// Request wire format is ported from qldt_native_transport.dart, including
// its A/B XOR+UTF-8 envelope. Session material is stored only in Keychain.
function qldtEncode(text,key) {
  let cipher='';for(let i=0;i<text.length;i++)cipher+=String.fromCharCode(text.charCodeAt(i)^key.charCodeAt(i%key.length));
  if(typeof Data!=='undefined')return Data.fromString(cipher).toBase64String();
  return Buffer.from(cipher,'utf8').toString('base64');
}
function qldtDecode(encoded,key) {
  const cipher=typeof Data!=='undefined'?Data.fromBase64String(encoded).toRawString():Buffer.from(encoded,'base64').toString('utf8');
  if(typeof cipher!=='string')throw errorCode('qldt_encoding','QLĐT trả envelope không phải UTF-8.');
  let text='';for(let i=0;i<cipher.length;i++)text+=String.fromCharCode(cipher.charCodeAt(i)^key.charCodeAt(i%key.length));return text;
}
async function qldtPost(session,action,func,extra) {
  const data={action,func,iM:session.iM,strQLSV_NguoiHoc_Id:session.userId,...extra};
  for(const [key,value]of Object.entries({strChucNang_Id:session.strChucNangId,strNguoiThucHien_Id:session.userId,strVaiTroDangNhap_Id:session.appId,strChucNangHeThong_Id:session.strChucNangId}))if(!(key in data))data[key]=value;
  const prefix=action.slice(0,action.indexOf('_')),path=prefix==='DKH'?'/dangkyhocapi3/api':prefix==='SV'?'/sinhvienapi3/api':null;
  if(!path)throw errorCode('qldt_route','API prefix không hợp lệ.');
  const request=new Request('https://qldtbeta.phenikaa-uni.edu.vn'+path+'/'+action);
  request.method='POST';request.timeoutInterval=5;
  request.headers={Authorization:'Bearer '+session.tokenJWT,Accept:'application/json, text/javascript, */*; q=0.01','Content-Type':'application/x-www-form-urlencoded; charset=UTF-8'};
  if(session.cookie)request.headers.Cookie=session.cookie;
  const key=action.slice(action.indexOf('/')+1);
  request.body='A='+encodeURIComponent(qldtEncode(JSON.stringify(data),key));
  // Inspect status before parsing: login redirects and 503 pages may be HTML.
  const text=await request.loadString(),status=request.response.statusCode;
  if(status===401||status===403)throw errorCode('qldt_session_expired','Phiên QLĐT đã hết hạn.');
  if(status!==200)throw errorCode('qldt_http','HTTP '+status);
  let result;
  try {result=JSON.parse(text);}catch(_){throw errorCode('qldt_response','QLĐT không trả JSON hợp lệ.');}
  if(result.Success!==true)throw errorCode('qldt_response','QLĐT Success != true');
  if(result.Data&&typeof result.Data.B==='string')result.Data=JSON.parse(qldtDecode(result.Data.B,session.iM));
  if(!Array.isArray(result.Data))throw errorCode('qldt_response','QLĐT Data không phải danh sách.');
  return result;
}
async function fetchNativeQldt(session) {
  const semesters=await qldtPost(session,'DKH_ThongTin_MH/DSA4FSkuKAYoIC8FIC8mCjgCIA8pIC8P','pkg_dangkyhoc_thongtin.LayThoiGianDangKyCaNhan',{strDaoTao_ThoiGianDaoTao_Id:null});
  const candidates=semesters.Data.map(r=>{const m=/^(\d{4})_(\d{4})_(\d+)$/.exec(String(r.THOIGIAN||''));return m&&+m[2]===+m[1]+1&&r.ID?{id:r.ID,name:r.THOIGIAN,year:+m[1],term:+m[3]}:null;}).filter(Boolean).sort((a,b)=>b.year-a.year||b.term-a.term);
  if(!candidates.length)throw errorCode('qldt_verification','NO_SEMESTER');
  const latest=candidates[0],plans=await qldtPost(session,'DKH_ThongTin_MH/DSA4BRIKJAkuICIpBSAvJgo4AiAPKSAv','pkg_dangkyhoc_thongtin.LayDSKeHoachDangKyCaNhan',{strDaoTao_ThoiGianDaoTao_Id:latest.id});
  const matched=plans.Data.filter(r=>String(r.MAKEHOACH||'').trim()===latest.name||String(r.MAKEHOACH||'').trim().startsWith(latest.name+','));
  const ids=[...new Set(matched.map(r=>String(r.ID||'').trim()).filter(Boolean))],termIds=[...new Set(matched.map(r=>String(r.DAOTAO_THOIGIANDAOTAO_ID||'').trim()).filter(Boolean))];
  if(ids.length!==1||termIds.length!==1)throw errorCode('qldt_verification','PLAN_AMBIGUOUS');
  const registrations=await qldtPost(session,'DKH_Chung_MH/DSA4CiQ1EDQgBSAvJgo4DS4xCS4iESkgLwPP','pkg_dangkyhoc_chung.LayKetQuaDangKyLopHocPhan',{strDaoTao_ChuongTrinh_Id:'',strDangKy_KeHoachDangKy_Id:ids[0],strNguoiThucHien_Id:session.userId,strDaoTao_ThoiGianDaoTao_Id:latest.id});
  const raw={semesters,plans,registrations,userId:session.userId},reg=BPACore.registration(raw),chunks=BPACore.chunksFor(reg),replies=new Array(chunks.length);let next=0,failure=null;
  await Promise.all(Array.from({length:Math.min(8,chunks.length)},async()=>{
    while(!failure&&next<chunks.length){
      const i=next++,chunk=chunks[i];
      try {replies[i]=await qldtPost(session,'SV_ThongTin_MH/DSA4BRINKCIpAiAPKSAv','pkg_congthongtin_hssv_thongtin.LayDSLichCaNhan',{strNgayBatDau:chunk.start,strNgayKetThuc:chunk.end});}
      catch(error){if(!failure)failure=error;}
    }
  }));
  // Drain the issued requests before allowing retry; no orphan workers may
  // continue dispatching another semester after the caller receives failure.
  if(failure)throw failure;
  const semester=BPACore.buildSemester(reg,BPACore.parseSchedule({Success:true,Data:replies.flatMap(r=>r.Data)}));
  if(!semester.displayName)throw errorCode('qldt_verification','QLDT_CANONICAL_NAME_MISSING');
  if(!chunks.length)throw errorCode('qldt_verification','Không xác định được môn đầu học kỳ.');
  return {semester,termStartedAt:localISO(BPACore.vnDate(chunks[0].start))};
}
