function parseCSV(text) {
    const rows = [];
    let currentField = '';
    let currentRow = [];
    let insideQuotes = false;

    for (let index = 0; index < text.length; index++) {
        const char = text[index];
        const nextChar = text[index + 1];

        if (insideQuotes) {
            if (char === '"' && nextChar === '"') {
                currentField += '"';
                index++;
                continue;
            }
            if (char === '"' && nextChar !== '"') {
                insideQuotes = false;
                continue;
            }
            currentField += char;
            continue;
        }

        if (char === '"') {
            insideQuotes = true;
            continue;
        }

        if (char === ',' && !insideQuotes) {
            currentRow.push(currentField);
            currentField = '';
            continue;
        }

        if ((char === '\n' || char === '\r') && !insideQuotes) {
            if (currentField !== '' || currentRow.length) {
                currentRow.push(currentField);
                rows.push(currentRow);
                currentRow = [];
                currentField = '';
            }
            continue;
        }

        currentField += char;
    }

    if (currentField !== '' || currentRow.length) {
        currentRow.push(currentField);
        rows.push(currentRow);
    }

    return rows;
}

function extractVideoId(url) {
    try {
        const parsedUrl = new URL(url);
        if (parsedUrl.hostname.includes('youtube.com'))
            return parsedUrl.searchParams.get('v');
        if (parsedUrl.hostname === 'youtu.be')
            return parsedUrl.pathname.replace('/', '');
        return '';
    } catch (error) {
        console.warn('Niepoprawny URL filmu', url, error);
        return '';
    }
}

const headerMapCandidates = {
    title: ['title', 'video title', 'video_title', 'nazwatytuł', 'tytuł', 'nazwa filmu'],
    url: ['url', 'link', 'video url', 'video_url', 'adres'],
    videoId: ['id', 'video id', 'video_id', 'identyfikator filmu', 'identyfikator', 'id filmu'],
    added: ['time', 'time added', 'date', 'added', 'data', 'time_added', 'sygnatura czasowa utworzenia filmu z playlisty'],
    channel: ['channel', 'channel title', 'channel_name', 'autor', 'autor kanału'],
    description: ['description', 'opis'],
    duration: ['duration', 'length', 'czas trwania', 'długość']
};

function normalizeHeader(value) {
    return value.toLowerCase().trim();
}

function findColumnIndex(headers, candidates) {
    const normalized = headers.map(normalizeHeader);
    for (const candidate of candidates) {
        const index = normalized.findIndex(header => header === candidate || header.includes(candidate));
        if (index !== -1)
            return index;
    }
    return -1;
}

function mapHeaders(headers) {
    const indices = {};
    for (const key in headerMapCandidates) {
        indices[key] = findColumnIndex(headers, headerMapCandidates[key]);
    }
    return indices;
}

const metadataCache = new Map();
async function fetchTitleAndChannel(videoId) {
    if (!videoId)
        return { title: '', channel: '', duration: '' };
    if (metadataCache.has(videoId))
        return metadataCache.get(videoId);
    try {
        const response = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
        if (!response.ok) throw new Error(response.status);
        const payload = await response.json();
        const result = {
            title: payload?.title || '',
            channel: payload?.author_name || '',
            duration: payload?.duration || ''
        };
        metadataCache.set(videoId, result);
        return result;
    } catch (error) {
        console.warn('Nie udało się pobrać metadanych dla', videoId, error);
        return { title: '', channel: '', duration: '' };
    }
}

function formatDuration(seconds) {
    const total = Number(seconds);
    if (!Number.isFinite(total) || total <= 0) return '';
    const hrs = Math.floor(total / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = Math.floor(total % 60);
    if (hrs > 0) return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    return `${mins}:${String(secs).padStart(2, '0')}`;
}

const PAGE_SIZE = 20;
let currentCards = [];
let renderedCount = 0;
let isRendering = false;
let isSingleColumn = false;

function clearGrid() {
    document.getElementById('grid').innerHTML = '';
    renderedCount = 0;
}

function appendCards(cardsBatch) {
    const grid = document.getElementById('grid');
    const fragment = document.createDocumentFragment();

    for (const cardData of cardsBatch) {
        const card = document.createElement('div');
        card.className = 'card';

        const thumb = document.createElement('div');
        thumb.className = 'thumb';

        const img = document.createElement('img');
        img.loading = 'lazy';
        img.src = cardData.videoId ? `https://i.ytimg.com/vi/${cardData.videoId}/hqdefault.jpg` : '';
        img.alt = cardData.title || cardData.videoId || 'Miniatura';
        thumb.appendChild(img);

        card.appendChild(thumb);

        const body = document.createElement('div');
        body.className = 'body';

        const titleLink = document.createElement('a');
        titleLink.className = 'title';
        titleLink.href = cardData.url || '#';
        titleLink.target = '_blank';
        titleLink.rel = 'noreferrer';
        titleLink.textContent = cardData.title || cardData.videoId || 'Bez tytułu';
        body.appendChild(titleLink);

        const meta = document.createElement('div');
        meta.className = 'meta';

        let channelChip = null;
        if (cardData.channel) {
            channelChip = document.createElement('span');
            channelChip.className = 'chip';
            channelChip.textContent = cardData.channel;
            meta.appendChild(channelChip);
        }

        body.appendChild(meta);

        if (cardData.description) {
            const descriptionBlock = document.createElement('div');
            descriptionBlock.className = 'meta';
            descriptionBlock.textContent = cardData.description.slice(0, 160);
            body.appendChild(descriptionBlock);
        }

        if (cardData.videoId && (!cardData.title || !cardData.channel || !cardData.duration)) {
            fetchTitleAndChannel(cardData.videoId).then(({ title, channel, duration }) => {
                if (title && !cardData.title) {
                    cardData.title = title;
                    titleLink.textContent = title;
                }
                if (channel && !cardData.channel) {
                    cardData.channel = channel;
                    if (!channelChip) {
                        channelChip = document.createElement('span');
                        channelChip.className = 'chip';
                        meta.appendChild(channelChip);
                    }
                    channelChip.textContent = channel;
                }
                if (duration && !cardData.duration) {
                    cardData.duration = duration;
                    badge.textContent = formatDuration(duration) || badge.textContent;
                }
            });
        }

        card.appendChild(body);
        fragment.appendChild(card);
    }

    grid.appendChild(fragment);
}

function renderNextPage() {
    if (isRendering)
        return;
    if (renderedCount >= currentCards.length)
        return;
    isRendering = true;
    const batch = currentCards.slice(renderedCount, renderedCount + PAGE_SIZE);
    appendCards(batch);
    renderedCount += batch.length;
    isRendering = false;
}

function renderAllReset() {
    const empty = document.getElementById('empty');
    clearGrid();
    if (!currentCards.length) {
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';
    renderNextPage();
}

function shuffle(array) {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function sortCards(cards, mode) {
    if (mode === 'random') return shuffle(cards);
    return [...cards].sort((a, b) => {
        if (mode === 'title_asc')
            return (a.title || '').localeCompare(b.title || '');
        if (mode === 'title_desc')
            return (b.title || '').localeCompare(a.title || '');
        if (mode === 'added_asc')
            return (a.added || '').localeCompare(b.added || '');
        return (b.added || '').localeCompare(a.added || '');
    });
}

window.addEventListener('scroll', () => {
    const { scrollY, innerHeight } = window;
    const documentHeight = document.documentElement.scrollHeight;
    if (scrollY + innerHeight >= documentHeight - 300) {
        renderNextPage();
    }
});

document.getElementById('file').addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file)
        return;

    const reader = new FileReader();
    reader.onload = () => {
        const text = reader.result.toString();
        const rows = parseCSV(text);
        if (!rows.length)
            return;

        const headerRow = rows[0];
        const headerIndexMap = mapHeaders(headerRow);

        const cards = rows.slice(1).map(row => {
            const read = (key) => headerIndexMap[key] >= 0 ? (row[headerIndexMap[key]] || '').trim() : '';
            const videoId = read('videoId') || extractVideoId(read('url')) || '';
            const url = read('url') || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : '');
            const duration = read('duration');
            return {
                title: read('title'),
                url,
                added: read('added'),
                channel: read('channel'),
                description: read('description'),
                videoId,
                duration
            };
        }).filter(card => card.videoId || card.url || card.title);

        currentCards = sortCards(cards, document.getElementById('sort').value);
        renderAllReset();
    };

    reader.readAsText(file, 'UTF-8');
});

document.getElementById('sort').addEventListener('change', (event) => {
    currentCards = sortCards(currentCards, event.target.value);
    renderAllReset();
});

document.getElementById('clearBtn').addEventListener('click', () => {
    document.getElementById('file').value = '';
    currentCards = [];
    renderAllReset();
});

const toggleViewBtn = document.getElementById('toggleViewBtn');
if (toggleViewBtn) {
    toggleViewBtn.addEventListener('click', () => {
        isSingleColumn = !isSingleColumn;
        const grid = document.getElementById('grid');
        if (isSingleColumn) {
            grid.classList.add('single-column');
            toggleViewBtn.textContent = 'Single column';
        } else {
            grid.classList.remove('single-column');
            toggleViewBtn.textContent = 'Grid view';
        }
    });
}