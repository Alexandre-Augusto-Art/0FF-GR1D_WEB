/**
 * Content Loader - Carrega e exibe conteúdo dinâmico dos JSONs
 */

// Função para carregar reflexões
async function loadReflections() {
  try {
    const response = await fetch('data/reflections.json');
    if (!response.ok) {
      throw new Error('Erro ao carregar reflexões');
    }
    const reflections = await response.json();
    
    if (!Array.isArray(reflections) || reflections.length === 0) {
      return null;
    }
    
    return reflections;
  } catch (error) {
    console.error('Erro ao carregar reflexões:', error);
    return null;
  }
}

// Função para carregar frases motivacionais
async function loadMotivations() {
  try {
    const response = await fetch('data/motivations.json');
    if (!response.ok) {
      throw new Error('Erro ao carregar frases motivacionais');
    }
    const motivations = await response.json();
    
    if (!Array.isArray(motivations) || motivations.length === 0) {
      return null;
    }
    
    return motivations;
  } catch (error) {
    console.error('Erro ao carregar frases motivacionais:', error);
    return null;
  }
}

// Função para formatar data
function formatDate(dateString) {
  if (!dateString) return 'Data não disponível';
  try {
    const date = new Date(dateString + 'T00:00:00');
    if (isNaN(date.getTime())) {
      return dateString; // Retorna a string original se a data for inválida
    }
    return date.toLocaleDateString('pt-BR', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
    });
  } catch (e) {
    return dateString; // Retorna a string original em caso de erro
  }
}

// Função para renderizar reflexões na página news.html (W4K3 PR0T0C0L)
function renderReflections(reflections) {
  const reflectionContainer = document.getElementById('reflection-section');
  const sourcesContainer = document.getElementById('sources-section');
  
  if (!reflectionContainer) return;
  
  // Limpar conteúdo placeholder
  const placeholder = reflectionContainer.querySelector('p');
  if (placeholder) {
    reflectionContainer.innerHTML = '';
  }
  
  // Debug: verificar se reflections é válido
  if (!reflections || !Array.isArray(reflections) || reflections.length === 0) {
    reflectionContainer.innerHTML = '<p style="line-height: 1.8; opacity: 0.9;">Nenhuma reflexão disponível.</p>';
    return;
  }
  
  // Pegar a reflexão mais recente (primeira do array)
  const latest = reflections[0];
  
  if (!latest) {
    reflectionContainer.innerHTML = '<p style="line-height: 1.8; opacity: 0.9;">Nenhuma reflexão disponível.</p>';
    return;
  }
  
  // Verificar se tem a nova estrutura (com news e reflection) ou estrutura antiga
  const hasNewStructure = latest.news && latest.reflection;
  
  if (hasNewStructure) {
    // Nova estrutura: reflexão sobre notícia
    const dateStr = latest.date ? formatDate(latest.date) : 'Data não disponível';
    const reflectionTitle = (latest.reflection && latest.reflection.title) ? latest.reflection.title : 'Reflexão sobre Notícia';
    const newsTitle = (latest.news && latest.news.title) ? latest.news.title : 'Notícia não disponível';
    const newsLink = (latest.news && latest.news.link) ? latest.news.link : '#';
    const newsSummary = (latest.news && latest.news.summary) ? latest.news.summary : '';
    const newsSource = (latest.news && latest.news.source) ? latest.news.source : 'Fonte desconhecida';
    const newsDate = (latest.news && latest.news.publishedDate) ? formatDate(latest.news.publishedDate) : '';
    const reflectionContent = (latest.reflection && latest.reflection.content) ? latest.reflection.content : 'Conteúdo não disponível';
    const reflectionExcerpt = (latest.reflection && latest.reflection.excerpt) ? latest.reflection.excerpt : '';
    
    const reflectionHTML = `
      <div class="reflection-item" style="margin-bottom: 2rem; padding: 1.5rem; background: rgba(0, 0, 0, 0.3); border-left: 3px solid var(--color-primary);">
        <div style="margin-bottom: 0.5rem; color: var(--color-secondary); font-size: 0.9rem; opacity: 0.7;">
          ${dateStr}
        </div>
        <h2 style="margin-bottom: 1rem; color: var(--color-primary); font-size: 1.5rem;">
          ${reflectionTitle}
        </h2>
        <div style="margin-bottom: 1rem; padding: 1rem; background: rgba(0, 0, 0, 0.2); border-left: 2px solid var(--color-secondary);">
          <div style="font-size: 0.85rem; color: var(--color-secondary); opacity: 0.8; margin-bottom: 0.5rem;">
            NOTÍCIA BASE:
          </div>
          <a href="${newsLink}" target="_blank" rel="noopener noreferrer" style="color: var(--color-primary); text-decoration: underline; font-weight: 500;">
            ${newsTitle}
          </a>
          ${newsSummary ? `
            <p style="margin-top: 0.5rem; font-size: 0.9rem; opacity: 0.85; line-height: 1.6;">
              ${newsSummary.substring(0, 200)}${newsSummary.length > 200 ? '...' : ''}
            </p>
          ` : ''}
          <div style="margin-top: 0.5rem; font-size: 0.8rem; opacity: 0.7;">
            Fonte: ${newsSource}${newsDate ? ' | ' + newsDate : ''}
          </div>
        </div>
        <div style="line-height: 1.8; opacity: 0.9; white-space: pre-wrap; margin-top: 1.5rem;">
          ${reflectionContent}
        </div>
        ${reflectionExcerpt && reflectionExcerpt !== reflectionContent ? `
          <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255, 255, 255, 0.1); font-style: italic; opacity: 0.8;">
            ${reflectionExcerpt}
          </div>
        ` : ''}
      </div>
    `;
    
    reflectionContainer.insertAdjacentHTML('afterbegin', reflectionHTML);
    
    // Renderizar fontes
    if (sourcesContainer && latest.sources && latest.sources.length > 0) {
      const sourcesHTML = `
        <h2 style="margin-bottom: 1rem; color: var(--color-primary);">FONTES</h2>
        <div style="display: grid; gap: 1rem;">
          ${latest.sources.map(source => `
            <div style="padding: 1rem; background: rgba(0, 0, 0, 0.2); border-left: 2px solid var(--color-secondary);">
              <a href="${source.link}" target="_blank" rel="noopener noreferrer" 
                 style="color: var(--color-primary); text-decoration: underline; font-weight: 500; display: block; margin-bottom: 0.5rem;">
                ${source.title}
              </a>
              <div style="font-size: 0.85rem; opacity: 0.7; color: var(--color-secondary);">
                ${source.source} | ${formatDate(source.date)}
              </div>
            </div>
          `).join('')}
        </div>
      `;
      
      sourcesContainer.innerHTML = sourcesHTML;
    }
    
    // Se houver mais reflexões, criar seção de histórico
    if (reflections.length > 1) {
      const historyHTML = `
        <div style="margin-top: 3rem;">
          <h2 style="margin-bottom: 1rem; color: var(--color-primary);">HISTÓRICO DE REFLEXÕES</h2>
          <div class="reflections-history" style="display: grid; gap: 1.5rem;">
            ${reflections.slice(1, 11).map(reflection => {
              const hasNewStruct = reflection.news && reflection.reflection;
              const title = hasNewStruct ? reflection.reflection.title : reflection.title || 'Reflexão';
              const excerpt = hasNewStruct ? reflection.reflection.excerpt : reflection.excerpt || reflection.content?.substring(0, 200) + '...';
              
              return `
                <div class="reflection-item" style="padding: 1rem; background: rgba(0, 0, 0, 0.2); border-left: 2px solid var(--color-secondary);">
                  <div style="margin-bottom: 0.5rem; color: var(--color-secondary); font-size: 0.85rem; opacity: 0.7;">
                    ${formatDate(reflection.date)}
                  </div>
                  <h3 style="margin-bottom: 0.5rem; color: var(--color-primary); font-size: 1.1rem;">
                    ${title}
                  </h3>
                  <p style="line-height: 1.6; opacity: 0.85; font-size: 0.95rem;">
                    ${excerpt}
                  </p>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
      
      reflectionContainer.insertAdjacentHTML('beforeend', historyHTML);
    }
  } else {
    // Estrutura antiga: manter compatibilidade
    const reflectionHTML = `
      <div class="reflection-item" style="margin-bottom: 2rem; padding: 1.5rem; background: rgba(0, 0, 0, 0.3); border-left: 3px solid var(--color-primary);">
        <div style="margin-bottom: 0.5rem; color: var(--color-secondary); font-size: 0.9rem; opacity: 0.7;">
          ${formatDate(latest.date)}
        </div>
        <h2 style="margin-bottom: 1rem; color: var(--color-primary); font-size: 1.5rem;">
          ${latest.title || 'Reflexão do Dia'}
        </h2>
        <div style="line-height: 1.8; opacity: 0.9; white-space: pre-wrap;">
          ${latest.content}
        </div>
        ${latest.excerpt && latest.excerpt !== latest.content ? `
          <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255, 255, 255, 0.1); font-style: italic; opacity: 0.8;">
            ${latest.excerpt}
          </div>
        ` : ''}
      </div>
    `;
    
    reflectionContainer.insertAdjacentHTML('afterbegin', reflectionHTML);
  }
}

// Função para renderizar frase motivacional na página motivacao.html
function renderMotivation(motivations) {
  const container = document.querySelector('.content-section');
  if (!container) return;
  
  // Pegar a frase mais recente (primeira do array)
  const latest = motivations[0];
  
  if (!latest) return;
  
  // Atualizar mensagem do dia
  const messageSection = container.querySelector('h2');
  if (messageSection && messageSection.textContent.includes('MENSAGEM DO DIA')) {
    const messageP = messageSection.nextElementSibling;
    if (messageP && messageP.tagName === 'P') {
      messageP.innerHTML = `"${latest.content}"`;
      messageP.style.fontSize = '1.3rem';
      messageP.style.fontWeight = '500';
      messageP.style.color = 'var(--color-primary)';
    }
  }
  
  // Se houver mais frases, criar seção de histórico
  if (motivations.length > 1) {
    // Remover seção de frases inspiradoras placeholder se existir
    const inspirationSection = Array.from(container.querySelectorAll('h2')).find(
      h2 => h2.textContent.includes('FRASES INSPIRADORAS')
    );
    
    if (inspirationSection) {
      const nextP = inspirationSection.nextElementSibling;
      if (nextP && nextP.textContent.includes('Conteúdo de motivação')) {
        inspirationSection.parentElement.removeChild(nextP);
      }
      
      const historyHTML = `
        <div style="margin-top: 2rem;">
          <h2 style="margin-bottom: 1rem; color: var(--color-secondary);">FRASES ANTERIORES</h2>
          <div class="motivations-history" style="display: grid; gap: 1rem;">
            ${motivations.slice(1, 21).map(motivation => `
              <div class="motivation-item" style="padding: 1rem; background: rgba(0, 0, 0, 0.2); border-left: 2px solid var(--color-secondary);">
                <div style="margin-bottom: 0.5rem; color: var(--color-secondary); font-size: 0.85rem; opacity: 0.7;">
                  ${formatDate(motivation.date)}
                </div>
                <p style="line-height: 1.6; opacity: 0.9; font-size: 1rem; font-style: italic;">
                  "${motivation.content}"
                </p>
              </div>
            `).join('')}
          </div>
        </div>
      `;
      
      inspirationSection.insertAdjacentHTML('afterend', historyHTML);
    }
  }
}

// Inicializar carregamento baseado na página atual
document.addEventListener('DOMContentLoaded', async () => {
  const currentPage = window.location.pathname.split('/').pop() || '';
  
  if (currentPage === 'news.html' || currentPage === '' || currentPage.includes('news')) {
    // Carregar reflexões
    const reflections = await loadReflections();
    if (reflections) {
      renderReflections(reflections);
    }
  } else if (currentPage === 'motivacao.html' || currentPage.includes('motivacao')) {
    // Carregar frases motivacionais
    const motivations = await loadMotivations();
    if (motivations) {
      renderMotivation(motivations);
    }
  }
});

