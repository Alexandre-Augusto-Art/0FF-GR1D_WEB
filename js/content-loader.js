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
  const date = new Date(dateString + 'T00:00:00');
  return date.toLocaleDateString('pt-BR', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric' 
  });
}

// Função para renderizar reflexões na página news.html
function renderReflections(reflections) {
  const container = document.querySelector('.content-section');
  if (!container) return;
  
  // Limpar conteúdo placeholder
  const placeholder = container.querySelector('p');
  if (placeholder && placeholder.textContent.includes('Conteúdo de notícias será adicionado')) {
    container.innerHTML = '';
  }
  
  // Pegar a reflexão mais recente (primeira do array)
  const latest = reflections[0];
  
  if (!latest) return;
  
  // Criar HTML para a reflexão do dia
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
  
  // Adicionar reflexão do dia
  container.insertAdjacentHTML('afterbegin', reflectionHTML);
  
  // Se houver mais reflexões, criar seção de histórico
  if (reflections.length > 1) {
    const historyHTML = `
      <div style="margin-top: 3rem;">
        <h2 style="margin-bottom: 1rem; color: var(--color-primary);">HISTÓRICO DE REFLEXÕES</h2>
        <div class="reflections-history" style="display: grid; gap: 1.5rem;">
          ${reflections.slice(1, 11).map(reflection => `
            <div class="reflection-item" style="padding: 1rem; background: rgba(0, 0, 0, 0.2); border-left: 2px solid var(--color-secondary);">
              <div style="margin-bottom: 0.5rem; color: var(--color-secondary); font-size: 0.85rem; opacity: 0.7;">
                ${formatDate(reflection.date)}
              </div>
              <h3 style="margin-bottom: 0.5rem; color: var(--color-primary); font-size: 1.1rem;">
                ${reflection.title || 'Reflexão'}
              </h3>
              <p style="line-height: 1.6; opacity: 0.85; font-size: 0.95rem;">
                ${reflection.excerpt || reflection.content.substring(0, 200) + '...'}
              </p>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    
    container.insertAdjacentHTML('beforeend', historyHTML);
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

