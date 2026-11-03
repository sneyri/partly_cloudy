// Текущая сцена (0 - старт, 1 - конфликт, 2 - разрешение, 3 - мнение)
let currentScene = 0;
const totalScenes = 4;

// Элементы
const app = document.getElementById('app');
const rainContainer = document.getElementById('rain-particles');
const sections = document.querySelectorAll('.story-section');
const opinionSection = document.getElementById('section-opinion');
const toggleButton = document.getElementById('theme-toggle');

// Скрываем все секции, кроме первой
function hideAllSections() {
    sections.forEach(section => section.style.display = 'none');
    opinionSection.style.display = 'none';
}

// Показываем нужную секцию
function showSection(index) {
    if (index < sections.length) {
        sections[index].style.display = 'flex';
    } else {
        opinionSection.style.display = 'block';
    }
}

// Применяем класс темы к body
function applyTheme() {
    app.className = ''; // Сбрасываем все классы
    if (currentScene === 0) {
        app.classList.add('theme-start');
    } else if (currentScene === 1) {
        app.classList.add('theme-conflict');
    } else if (currentScene === 2) {
        app.classList.add('theme-resolution');
    } else {
        // Для мнения оставляем цвета предыдущей сцены (разрешения) или можно задать свои
        app.classList.add('theme-resolution'); 
    }
}

// Функция создания дождя (партиклов)
function createRain() {
    rainContainer.innerHTML = ''; // Очищаем старые капли
    const dropsCount = 50;
    for (let i = 0; i < dropsCount; i++) {
        const drop = document.createElement('div');
        drop.classList.add('rain-drop');
        
        // Случайная позиция и размер
        drop.style.left = Math.random() * 100 + 'vw';
        drop.style.animationDuration = (Math.random() * 2 + 1) + 's';
        drop.style.animationDelay = Math.random() * 2 + 's';
        
        rainContainer.appendChild(drop);
    }
}

// Основная функция переключения
function changeScene() {
    hideAllSections();
    applyTheme();
    
    if (currentScene === 1) {
        createRain();
    } else {
        rainContainer.innerHTML = ''; // Убираем дождь на других сценах
    }
    
    showSection(currentScene);
}

// Автоматическое переключение (для демонстрации)
// Раскомментируйте, если хотите, чтобы сайт листался сам каждые 10 секунд
/*
let autoScroll = setInterval(() => {
    currentScene++;
    if (currentScene >= totalScenes) {
        currentScene = 0;
    }
    changeScene();
}, 10000);
*/

// Ручное переключение по кнопке
toggleButton.addEventListener('click', () => {
    currentScene++;
    if (currentScene >= totalScenes) {
        currentScene = 0;
    }
    changeScene();
});

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    changeScene();
});