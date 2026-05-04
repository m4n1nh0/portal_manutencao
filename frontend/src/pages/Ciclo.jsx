import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { SectorTag, Spinner, InfoBox } from '../components/UI';
import api from '../utils/api';

export default function Ciclo() {
  const [ciclo,   setCiclo]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.ciclo()
      .then(r => setCiclo(r.ciclo))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout title="Ciclo de 8 Dias">
      <InfoBox>
        🔄 O ciclo de 8 dias distribui a limpeza de ruas e roçagem por setor, rotacionando diariamente.
      </InfoBox>
      {loading ? <Spinner/> : (
        <div className="task-list">
          {ciclo.map(c => (
            <div key={c.id} className="task-card">
              <div className="task-card-top">
                <div className="task-card-title">{c.trecho}</div>
                <span className="badge-ciclo">Dia {c.dia_ciclo}</span>
              </div>
              <div className="task-card-meta">
                <SectorTag setor={c.setor}/>
              </div>
              <div className="ciclo-details">
                🧹 {c.limpeza}<br/>
                ✂️ {c.rocagem}<br/>
                🔍 {c.inspecao}
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
