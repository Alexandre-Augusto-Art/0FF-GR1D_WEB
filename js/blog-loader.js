/**
 * blog-loader.js
 * Carrega e exibe posts do diretório posts/
 * Para usar: copie este arquivo para C:\Users\AAA-DESKTOP\Documents\GitHub\0FF-GR1D_WEB\js\blog-loader.js
 */

async function loadPosts() {
    try {
        const response = await fetch('posts/index.json');
        if (!response.ok) {
            throw new Error('Erro ao carregar posts');
        }
        
        const posts = await response.json();
        return posts;
    } catch (error) {
        console.error('Erro ao carregar posts:', error);
        return [];
    }
}

function formatDate(dateString) {
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) {
            return dateString;
        }
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        return date.toLocaleDateString('pt-BR', options);
    } catch (e) {
        return dateString;
    }
}

function renderPostsList(posts, containerId = 'posts-list') {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container #${containerId} não encontrado`);
        return;
    }
    
    if (posts.length === 0) {
        container.innerHTML = '<p class="no-posts">Nenhum post encontrado.</p>';
        return;
    }
    
    const html = posts.map(post => {
        const date = formatDate(post.date);
        const tags = post.tags ? post.tags.join(', ') : '';
        const excerpt = post.excerpt || '';
        
        return `
            <article class="post-preview">
                <header>
                    <h2><a href="posts/${post.filename}">${post.title || 'Sem título'}</a></h2>
                    <p class="date">${date}</p>
                </header>
                ${excerpt ? `<p class="excerpt">${excerpt}</p>` : ''}
                ${tags ? `<div class="tags">${tags}</div>` : ''}
            </article>
        `;
    }).join('');
    
    container.innerHTML = html;
}

// Função principal para carregar e exibir posts na página principal
async function initBlogList() {
    const posts = await loadPosts();
    renderPostsList(posts, 'posts-list');
}

// Auto-executar se estiver na página principal
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBlogList);
} else {
    initBlogList();
}

// Exportar funções para uso externo
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { loadPosts, renderPostsList, formatDate };
}