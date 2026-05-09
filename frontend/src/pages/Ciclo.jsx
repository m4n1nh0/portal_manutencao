import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { EmptyState, SectorTag, Spinner, InfoBox } from '../components/UI';
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

  const totalDias = ciclo.length ? Math.max(...ciclo.map((item) => Number(item.dia_ciclo) || 0)) : 0;
  const title = totalDias ? `Ciclo de ${totalDias} ${totalDias === 1 ? 'dia' : 'dias'}` : 'Ciclo';

  return (
    <Layout title={title}>
      <InfoBox>
        O ciclo e montado dinamicamente a partir dos dias cadastrados. Ajustes feitos em Cadastros aparecem aqui automaticamente.
      </InfoBox>

      {loading ? <Spinner/> : ciclo.length === 0 ? (
        <EmptyState icon="CI" title="Nenhum dia cadastrado" desc="Cadastre os dias do ciclo para exibir a rota operacional."/>
      ) : (
        <div className="ciclo-grid">
          {ciclo.map(c => {
            const atividades = (c.atividades || []).filter((atividade) => atividade.ativo);
            return (
              <article key={c.id} className="ciclo-card">
                <div className="ciclo-card-head">
                  <span className="ciclo-day">Dia {c.dia_ciclo}</span>
                  <SectorTag setor={c.setor}/>
                </div>
                <div className="ciclo-card-title">{c.trecho || c.setor}</div>
                <div className="ciclo-steps">
                  {atividades.length ? atividades.map((atividade) => (
                    <Step
                      key={atividade.id}
                      label={atividade.titulo}
                      value={atividade.descricao}
                      meta={[atividade.equipe, atividade.prioridade].filter(Boolean).join(' - ')}
                    />
                  )) : <Step label="Atividades" value="Nenhuma atividade ativa."/>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </Layout>
  );
}

function Step({ label, value, meta }) {
  return (
    <div className="ciclo-step">
      <span>{label}</span>
      <p>{value || '-'}</p>
      {meta && <small>{meta}</small>}
    </div>
  );
}
