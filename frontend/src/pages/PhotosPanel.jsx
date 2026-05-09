// PhotosPanel.jsx — painel de comprovações com watermark
import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { EmptyState, Spinner } from '../components/UI';
import api from '../utils/api';

export default function PhotosPanel({ tarefa, onClose }) {
  const { user }  = useAuth();
  const toast     = useToast();
  const canUpload = Boolean(user?.permissoes?.canPhoto);

  const [fotos,   setFotos]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [queue,   setQueue]   = useState([]);
  const [thumbs,  setThumbs]  = useState([]);
  const [obs,     setObs]     = useState('');
  const [sending, setSending] = useState(false);
  const [lb,      setLb]      = useState(null);
  const [confirmDel, setConfirmDel] = useState(null); // FIX: substituir window.confirm

  useEffect(() => { loadFotos(); }, []);

  async function loadFotos() {
    setLoading(true);
    try { const { fotos } = await api.listarFotos(tarefa.id); setFotos(fotos); }
    catch(e) { toast(e.message,'error'); }
    finally { setLoading(false); }
  }

  // Watermark via Canvas
  async function applyWatermark(file) {
    return new Promise(resolve => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const MAX=1920, sc=img.width>MAX?MAX/img.width:1;
        const c=document.createElement('canvas');
        c.width=Math.round(img.width*sc); c.height=Math.round(img.height*sc);
        const ctx=c.getContext('2d');
        ctx.drawImage(img,0,0,c.width,c.height);
        const barH=Math.max(40,Math.round(c.height*.065));
        ctx.fillStyle='rgba(0,0,0,0.65)';
        ctx.fillRect(0,c.height-barH,c.width,barH);
        const fs=Math.max(13,Math.round(barH*.38));
        ctx.fillStyle='#fff'; ctx.font=`600 ${fs}px "DM Sans",Arial,sans-serif`; ctx.textBaseline='middle';
        const dt=new Date().toLocaleDateString('pt-BR')+' '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
        ctx.fillText(`📷 ${user?.nome}  •  ${dt}`, Math.round(c.width*.015), c.height-barH/2);
        c.toBlob(blob=>{ URL.revokeObjectURL(url); resolve(new File([blob],file.name,{type:'image/jpeg'})); },'image/jpeg',.88);
      };
      img.src=url;
    });
  }

  function onFilesSelected(files) {
    const arr = Array.from(files);
    setQueue(arr);
    setThumbs(arr.map(f=>URL.createObjectURL(f)));
  }

  async function sendFotos() {
    if (!queue.length) return;
    setSending(true);
    try {
      const stamped = await Promise.all(queue.map(applyWatermark));
      await api.uploadFotos(tarefa.id, stamped, obs);
      setQueue([]); setThumbs([]); setObs('');
      toast('✅ Fotos enviadas!','success');
      loadFotos();
    } catch(e) { toast(e.message,'error'); }
    finally { setSending(false); }
  }

  async function deleteFoto(id) {
    // FIX: usar state dialog em vez de window.confirm (não funciona bem em mobile/WebView)
    setConfirmDel(id);
  }
  async function confirmarDelete(id) {
    setConfirmDel(null);
    try { await api.deletarFoto(id); setFotos(p=>p.filter(f=>f.id!==id)); toast('Foto removida.','info'); }
    catch(e) { toast(e.message,'error'); }
  }

  return (
    <>
      <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.72)',zIndex:200,
        display:'flex',alignItems:'flex-end',justifyContent:'center' }}
        onClick={onClose}>
        <div onClick={e=>e.stopPropagation()} style={{
          background:'var(--s)',borderRadius:'20px 20px 0 0',
          width:'100%',maxWidth:'700px',maxHeight:'93vh',overflowY:'auto',
          paddingBottom:'calc(16px + env(safe-area-inset-bottom))',
          animation:'slideUp .3s cubic-bezier(.16,1,.3,1)',
        }}>
          <div style={{width:'36px',height:'4px',background:'var(--bd)',borderRadius:'2px',margin:'12px auto 4px'}}/>
          <div style={{padding:'4px 20px 12px',borderBottom:'1px solid var(--bd)',display:'flex',alignItems:'center',gap:'10px'}}>
            <span className="stag">{tarefa.setor}</span>
            <span style={{fontSize:'14px',fontWeight:500,flex:1}}>{tarefa.atividade}</span>
            <button onClick={onClose} style={{background:'none',border:'none',color:'var(--mu)',fontSize:'20px',cursor:'pointer'}}>✕</button>
          </div>

          {/* Upload */}
          {canUpload && (
            <div style={{padding:'14px 20px',borderBottom:'1px solid var(--bd)'}}>
              <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap',marginBottom:'10px'}}>
                <label style={{display:'contents',cursor:'pointer'}}>
                  <input type="file" accept="image/*" capture="environment" multiple style={{display:'none'}}
                    onChange={e=>onFilesSelected(e.target.files)}/>
                  <span className="btn btn-primary btn-sm">📸 Câmera</span>
                </label>
                <label style={{display:'contents',cursor:'pointer'}}>
                  <input type="file" accept="image/*" multiple style={{display:'none'}}
                    onChange={e=>onFilesSelected(e.target.files)}/>
                  <span className="btn btn-ghost btn-sm">🖼 Galeria</span>
                </label>
                {queue.length>0 && <span className="muted-sm">{queue.length} foto(s) selecionada(s)</span>}
              </div>
              {thumbs.length>0 && (
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(80px,1fr))',gap:'8px',marginBottom:'10px'}}>
                  {thumbs.map((t,i)=>(
                    <div key={i} style={{borderRadius:'8px',overflow:'hidden',border:'2px solid var(--acc)',aspectRatio:'1'}}>
                      <img src={t} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                    </div>
                  ))}
                </div>
              )}
              {queue.length>0 && (
                <>
                  <input className="form-control" placeholder="Observação opcional…" value={obs}
                    onChange={e=>setObs(e.target.value)} style={{marginBottom:'8px'}}/>
                  <button className="btn btn-primary" style={{width:'100%'}} onClick={sendFotos} disabled={sending}>
                    {sending ? '⏳ Aplicando marca d\'água e enviando…' : '📤 Enviar fotos'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Galeria */}
          <div style={{padding:'14px 20px'}}>
            {loading ? <Spinner/> : fotos.length===0 ? (
              <EmptyState icon="📷" title="Nenhuma comprovação" desc="Envie fotos para comprovar a execução."/>
            ) : (
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:'12px'}}>
                {fotos.map(f => {
                  const dt = new Date(f.enviado_em).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
                  const canDel = ['admin','supervisor','sindico'].includes(user?.perfil) || f.usuario_id===user?.id;
                  return (
                    <div key={f.id} style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:'12px',overflow:'hidden'}}>
                      <div style={{aspectRatio:'4/3',cursor:'zoom-in',position:'relative',overflow:'hidden',background:'#0f1923'}}
                        onClick={()=>setLb({url:f.url,nome:f.enviado_por_nome,dt})}>
                        <img src={f.url} alt="Comprovação" loading="lazy"
                          style={{width:'100%',height:'100%',objectFit:'cover',transition:'transform .2s'}}
                          onMouseEnter={e=>e.target.style.transform='scale(1.03)'}
                          onMouseLeave={e=>e.target.style.transform='scale(1)'}/>
                        <div style={{position:'absolute',top:8,right:8,background:'rgba(0,0,0,.55)',color:'#fff',borderRadius:'20px',padding:'2px 8px',fontSize:'12px'}}>🔍</div>
                      </div>
                      <div style={{padding:'10px 14px 6px'}}>
                        <div style={{fontSize:'13px',fontWeight:500}}>👤 {f.enviado_por_nome||f.usuario_nome}</div>
                        <div style={{fontSize:'12px',color:'var(--mu)',marginTop:'2px'}}>🕐 {dt}</div>
                        {f.observacao && <div style={{fontSize:'12px',color:'var(--blu)',marginTop:'4px'}}>💬 {f.observacao}</div>}
                      </div>
                      <div style={{padding:'6px 14px 12px',display:'flex',gap:'8px'}}>
                        <a href={f.url} download target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">⬇ Baixar</a>
                        {canDel && <button className="btn btn-danger btn-sm" onClick={()=>setConfirmDel(f.id)}>🗑</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lb && (
        <div style={{position:'fixed',inset:0,zIndex:500,display:'flex',alignItems:'center',justifyContent:'center'}}
          onClick={()=>setLb(null)}>
          <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,.94)'}}/>
          <div style={{position:'relative',zIndex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:'10px',padding:'12px',maxWidth:'95vw',maxHeight:'95vh'}} onClick={e=>e.stopPropagation()}>
            <button onClick={()=>setLb(null)} style={{position:'absolute',top:'-8px',right:'-8px',width:'34px',height:'34px',borderRadius:'50%',background:'var(--s2)',border:'1px solid var(--bd)',color:'var(--tx)',fontSize:'16px',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
            <img src={lb.url} alt="" style={{maxWidth:'100%',maxHeight:'75vh',objectFit:'contain',borderRadius:'10px',boxShadow:'0 8px 40px rgba(0,0,0,.6)'}}/>
            <div style={{display:'flex',gap:'16px',flexWrap:'wrap',justifyContent:'center',fontSize:'13px',color:'var(--mu)'}}>
              <span>👤 {lb.nome}</span><span>🕐 {lb.dt}</span>
            </div>
            <a href={lb.url} download target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">⬇ Baixar original</a>
          </div>
        </div>
      )}
      {/* FIX: dialog de confirmação para mobile */}
      {confirmDel && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.75)',zIndex:600,
          display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}}>
          <div style={{background:'var(--s)',border:'1px solid var(--bd)',borderRadius:'14px',
            padding:'24px',width:'100%',maxWidth:'360px'}}>
            <h3 style={{fontFamily:'Syne,sans-serif',fontSize:'17px',marginBottom:'10px'}}>Excluir foto?</h3>
            <p style={{fontSize:'13px',color:'var(--mu)',marginBottom:'20px'}}>Esta ação não pode ser desfeita.</p>
            <div style={{display:'flex',gap:'10px',justifyContent:'flex-end'}}>
              <button className="btn btn-ghost" onClick={() => setConfirmDel(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={() => confirmarDelete(confirmDel)}>Excluir</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
