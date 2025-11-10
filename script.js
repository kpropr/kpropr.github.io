// === ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И НАСТРОЙКИ ===
let panelData = {};
const ELECTRICITY_TARIFF = 5.5; // Тариф на электроэнергию (руб/кВт·ч)
const SYSTEM_LOSS_FACTOR = 0.85; // Коэффициент системных потерь (15%)

// === 1. ЗАГРУЗКА ДАННЫХ МОДУЛЕЙ ===
async function loadPanelData() {
  try {
    const response = await fetch('hevel_modules.json');
    panelData = await response.json();
    console.log("✅ Данные HEVEL успешно загружены.");
    
    setTimeout(() => {
      calculateAndDisplay();
    }, 300);
  } catch (error) {
    console.error("❌ Ошибка загрузки данных HEVEL:", error);
  }
}

// === 2. ОСНОВНАЯ ФУНКЦИЯ РАСЧЕТА ===
function calculateAndDisplay(customPvout = null, regionName = null) {
  if (!panelData || Object.keys(panelData).length === 0) {
    console.warn("Данные panelData ещё не загружены — расчёт отложен.");
    return;
  }

  // --- Считывание данных из UI ---
  const countInput = document.getElementById('count');
  const areaInput = document.getElementById('area');
  const countValueDisplay = document.getElementById('count-value');
  const areaValueDisplay = document.getElementById('area-value');

  if (!countInput) return;

  const selectedModelId = 'HVL-450-HJT'; 
  let count = parseInt(countInput.value, 10) || 0;
  const area = parseFloat(areaInput?.value || 0);

  const module = panelData[selectedModelId];
  if (!module) {
    console.warn("Модель панели не найдена:", selectedModelId);
    return;
  }

  // --- Ограничение по площади ---
  const PANEL_AREA_M2 = 2.1; 
  let maxPanels = Infinity;
  if (area > 0) {
    maxPanels = Math.floor(area / PANEL_AREA_M2);
    if (maxPanels < 1) maxPanels = 0;
    try {
      countInput.max = maxPanels;
    } catch (e) {}
    if (count > maxPanels) {
      count = maxPanels;
      countInput.value = count;
    }
  }
  if (countValueDisplay) countValueDisplay.textContent = count;
  if (areaValueDisplay) areaValueDisplay.textContent = area ? `${area} м²` : '—';

  // --- Базовый расчет мощности ---
  const totalPowerKW = (module.max_power * count) / 1000; // кВт
  const totalPowerEl = document.getElementById('total-power');
  if (totalPowerEl) totalPowerEl.textContent = totalPowerKW.toFixed(1) + ' кВт';

  const output = document.getElementById('comparison-output');

  // --- Расчет для региона (если выбран) ---
  if (customPvout !== null && regionName !== null) {
    const pvout = customPvout;
    const yearlyGeneration = totalPowerKW * pvout * SYSTEM_LOSS_FACTOR;
    const yearlySavings = yearlyGeneration * ELECTRICITY_TARIFF;
    const totalSystemCost = (module.price_rub || 0) * count;
    const paybackPeriod = yearlySavings > 0 ? totalSystemCost / yearlySavings : 'N/A';

    if (output) {
      output.innerHTML = `
        <h3>${regionName}</h3>
        <p>Инсоляция (PVOUT): ${pvout} кВт·ч/кВтp/год</p>
        <p><strong>Выработка:</strong> ${Math.round(yearlyGeneration).toLocaleString('ru-RU')} кВт·ч</p>
        <p><strong>Экономия:</strong> ${Math.round(yearlySavings).toLocaleString('ru-RU')} ₽/год</p>
        <p><strong>Окупаемость:</strong> ${typeof paybackPeriod === 'number' ? paybackPeriod.toFixed(1) + ' лет' : '—'}</p>
      `;
    }
  } else {
    // --- Если регион НЕ выбран ---
    if (output) {
      output.innerHTML = `
        <p style="opacity:0.8; font-style:italic; color:#777;">
          🗺️ Пожалуйста, выберите область на карте, чтобы рассчитать показатели.
        </p>
      `;
    }
  }
}

// === 3. ОБРАБОТЧИКИ СОБЫТИЙ (СЛАЙДЕРЫ) ===
document.addEventListener('DOMContentLoaded', () => {
    loadPanelData();
    console.log("📂 Загружаем данные панелей...");

    const setupInputListeners = (id, valueDisplayId) => {
        const inputElement = document.getElementById(id);
        const displayElement = document.getElementById(valueDisplayId);

        if (inputElement && displayElement) {
             if (id === 'area') {
                displayElement.textContent = inputElement.value ? `${inputElement.value} м²` : '—';
             } else {
                displayElement.textContent = inputElement.value; 
             }
             
             inputElement.addEventListener('input', (e) => {
                if (id === 'area') {
                    displayElement.textContent = e.target.value ? `${e.target.value} м²` : '—';
                } else {
                    displayElement.textContent = e.target.value;
                }
                calculateAndDisplay(); 
             });
        }
    };

    setupInputListeners('count', 'count-value');
    setupInputListeners('area', 'area-value');

    ['count', 'area'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => calculateAndDisplay());
      el.addEventListener('change', () => calculateAndDisplay());
    });
});

// === 4. ГЛОБУС MAPLIBRE ===
document.addEventListener('DOMContentLoaded', () => {
  const map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '&copy; OpenStreetMap contributors'
        }
      },
      layers: [
        {
          id: 'background',
          type: 'background',
          paint: { 'background-color': '#aee0ff' } 
        },
        {
          id: 'osm-layer',
          type: 'raster',
          source: 'osm'
        }
      ]
    },
    center: [105, 63],
    zoom: 2.5,
    projection: 'globe' 
  });

  // --- Настройка атмосферы ---
  map.on('style.load', () => {
    if (map.setFog) {
      map.setFog({
        color: 'rgba(255,255,255,0)', 
        'space-color': 'rgb(5,5,15)', 
        'horizon-blend': 0.05 
      });
    }
  });

  // --- Загрузка GeoJSON регионов ---
  fetch('russia_regions.geojson') 
    .then(res => res.json())
    .then(data => {
      map.addSource('russia', { type: 'geojson', data });

      map.addLayer({
        id: 'russia-fill',
        type: 'fill',
        source: 'russia',
        paint: {
          'fill-color': '#b8d8ff',
          'fill-opacity': 0.6
        }
      });

      map.addLayer({
        id: 'russia-borders',
        type: 'line',
        source: 'russia',
        paint: {
          'line-color': '#333',
          'line-width': 1
        }
      });

      // --- Интерактивность карты ---
      map.on('mousemove', 'russia-fill', (e) => {
        map.getCanvas().style.cursor = e.features.length ? 'pointer' : '';
      });
      map.on('mouseleave', 'russia-fill', () => {
        map.getCanvas().style.cursor = '';
      });

      map.on('click', 'russia-fill', (e) => {
        if (!e.features || e.features.length === 0) return;
        
        const props = e.features[0].properties;
        const regionName = props.name;
        const pvout = props.pvout;

        map.setPaintProperty('russia-fill', 'fill-color', [
          'match',
          ['get', 'name'],
          regionName, '#ffd700', 
          '#b8d8ff' 
        ]);

        map.flyTo({
          center: e.lngLat,
          zoom: 3.8,
          speed: 0.6,
          curve: 1.2
        });

        new maplibregl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(`<b>${regionName}</b><br>PVOUT: ${pvout} кВт·ч/кВтp/год`)
          .addTo(map);

        // Запуск расчета с данными региона
        calculateAndDisplay(pvout, regionName);
      });
    })
    .catch(err => console.error("Ошибка загрузки карты:", err));
});
  const countInput = document.getElementById('count');
  const areaInput = document.getElementById('area'); // новый input площади
  const countValueDisplay = document.getElementById('count-value');
  const areaValueDisplay = document.getElementById('area-value');

  if (!countInput) return;

  // Считываем значения
  const selectedModelId = modelSelect?.value || 'HVL-450-HJT';
  let count = parseInt(countInput.value, 10) || 0;
  const area = parseFloat(areaInput?.value || 0);

  // берём данные модуля
  const module = panelData[selectedModelId];
  if (!module) {
    console.warn("Модель панели не найдена в panelData:", selectedModelId);
    return;
  }

  // Ограничение числа панелей по площади (если введена площадь)
  const PANEL_AREA_M2 = 2.1; // м² на одну панель (подстрой при необходимости)
  let maxPanels = Infinity;
  if (area > 0) {
    maxPanels = Math.floor(area / PANEL_AREA_M2);
    if (maxPanels < 1) maxPanels = 0;
    // установим ограничение на слайдер (если он есть)
    try {
      countInput.max = maxPanels;
    } catch (e) {}
    // если текущее значение больше максимально допустимого — уменьшаем
    if (count > maxPanels) {
      count = maxPanels;
      countInput.value = count;
    }
  }
  if (countValueDisplay) countValueDisplay.textContent = count;
  if (areaValueDisplay) areaValueDisplay.textContent = area ? `${area} м²` : '—';

  // Расчёты
  const totalPowerKW = (module.max_power * count) / 1000; // кВт
  // если регион не выбран — выводим сообщение и выходим
if (!selectedRegion && customPvout === null) {
  const output = document.getElementById('comparison-output');
  if (output) {
    output.innerHTML = `
      <p style="opacity:0.8; font-style:italic; color:#777;">
        🗺️ Регион ещё не выбран. Пожалуйста, выберите область на карте, чтобы рассчитать показатели.
      </p>
    `;
  }
  return; // прекращаем выполнение функции
}

// используем выбранный pvout
let pvout = customPvout !== null ? customPvout : selectedRegion.pvout;


  const yearlyGeneration = totalPowerKW * pvout * SYSTEM_LOSS_FACTOR;
  const yearlySavings = yearlyGeneration * ELECTRICITY_TARIFF;
  const totalSystemCost = (module.price_rub || 0) * count;
  const paybackPeriod = yearlySavings > 0 ? totalSystemCost / yearlySavings : 'N/A';

  // Вывод основных результатов (тот же блок, который у тебя был)
  const totalPowerEl = document.getElementById('total-power');
  const yearlyGenerationEl = document.getElementById('yearly-generation');
  const yearlySavingsEl = document.getElementById('yearly-savings');
  const paybackPeriodEl = document.getElementById('payback-period');

  if (totalPowerEl) totalPowerEl.textContent = totalPowerKW.toFixed(1) + ' кВт';
  if (yearlyGenerationEl) yearlyGenerationEl.textContent = Math.round(yearlyGeneration).toLocaleString('ru-RU');
  if (yearlySavingsEl) yearlySavingsEl.textContent = Math.round(yearlySavings).toLocaleString('ru-RU') + ' ₽';
  if (paybackPeriodEl) paybackPeriodEl.textContent = (typeof paybackPeriod === 'number') ? (paybackPeriod.toFixed(1) + ' лет') : paybackPeriod;
  // --- если выбран регион, пересчитываем для него ---
  if (selectedRegion) {
    const pvout = selectedRegion.pvout;
    const regionName = selectedRegion.name;

    const selectedModel = panelData["HVL-450-HJT"];
    const totalPowerKW = (selectedModel.max_power * count) / 1000;
    const yearlyGeneration = totalPowerKW * pvout * SYSTEM_LOSS_FACTOR;
    const yearlySavings = yearlyGeneration * ELECTRICITY_TARIFF;
    const totalSystemCost = selectedModel.price_rub * count;
    const paybackPeriod = yearlySavings > 0 ? totalSystemCost / yearlySavings : 'N/A';

    const output = document.getElementById('comparison-output');
    if (output) {
      output.innerHTML = `
        <h3>${regionName}</h3>
        <p>Инсоляция (PVOUT): ${pvout} кВт·ч/кВтp/год</p>
        <p>Выработка: ${Math.round(yearlyGeneration).toLocaleString('ru-RU')} кВт·ч</p>
        <p>Экономия: ${Math.round(yearlySavings).toLocaleString('ru-RU')} ₽/год</p>
        <p>Срок окупаемости: ${typeof paybackPeriod === 'number' ? paybackPeriod.toFixed(1) + ' лет' : '—'}</p>
      `;
    }
  }
  else {
  const output = document.getElementById('comparison-output');
  if (output) {
    output.innerHTML = `
      <p style="opacity:0.8; font-style:italic; color:#777;">
        🗺️ Регион ещё не выбран. Пожалуйста, выберите область на карте, чтобы рассчитать показатели.
      </p>
    `;
    }
  }
}


// 3. Обработчики событий (Запуск при взаимодействии)
document.addEventListener('DOMContentLoaded', () => {
    // Загружаем данные JSON при старте
    loadPanelData();
    console.log("📂 Загружаем данные панелей...");

    // Вспомогательная функция для обновления ползунков и запуска расчетов
    const setupInputListeners = (id, valueDisplayId) => {
        const inputElement = document.getElementById(id);
        const displayElement = document.getElementById(valueDisplayId);

        if (inputElement && displayElement) {
             // Инициализация отображаемого значения
             displayElement.textContent = inputElement.value; 

             inputElement.addEventListener('input', (e) => {
                displayElement.textContent = e.target.value;
                calculateAndDisplay();
             });
        }
    };

    // Вешаем слушателей на ползунки и select (должны совпадать с ID в index.html)
    // document.getElementById('panel-model').addEventListener('change', calculateAndDisplay);
    
    setupInputListeners('count', 'count-value');
    setupInputListeners('area', 'area-value');

    // Модели-вьюеры не требуют слушателей, они работают автоматически
});
// === КАРТА РЕГИОНОВ РОССИИ ===

let regions = {};
fetch('regions.json')
  .then(r => r.json())
  .then(data => {
    regions = data;
    console.log("Данные регионов загружены.");
  })
  .catch(err => console.error("Ошибка загрузки regions.json:", err));

document.addEventListener('DOMContentLoaded', () => {
  const svgMap = document.getElementById('svgmap');
  if (!svgMap) return;

  svgMap.querySelectorAll('.region').forEach(region => {
    region.addEventListener('click', () => {
      const id = region.dataset.region;
      const reg = regions[id];
      selectedRegion = reg;
      if (!reg) return;

      // Подсветка
      svgMap.querySelectorAll('.region').forEach(r => r.classList.remove('selected'));
      region.classList.add('selected');

      // Перерасчёт с новым PVOUT
      calculateAndDisplay(reg.pvout, reg.name);
    });
  });

  // при изменении ползунков — тоже обновляем расчёт
  ['count', 'area', 'panel-model'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => calculateAndDisplay());
    el.addEventListener('change', () => calculateAndDisplay());
  });

  // Первый расчёт после загрузки JSON
  setTimeout(() => calculateAndDisplay(), 1000);
});

// === ГЛОБУС MAPLIBRE (рабочий, без токена) ===
document.addEventListener('DOMContentLoaded', () => {
  const map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '&copy; OpenStreetMap contributors'
        }
      },
      layers: [
        {
          id: 'background',
          type: 'background',
          paint: { 'background-color': '#aee0ff' }
        },
        {
          id: 'osm-layer',
          type: 'raster',
          source: 'osm'
        }
      ]
    },
    center: [105, 63],
    zoom: 2.5,
    projection: 'globe' // 🌍 именно это делает 3D-глобус
  });

  // Атмосфера (работает только в 3.0+)
  map.on('style.load', () => {
    if (map.setFog) {
      map.setFog({
        color: 'rgba(255,255,255,0)',
        'space-color': 'rgb(5,5,15)',
        'horizon-blend': 0.05
      });
    }
  });

  // === Грузим регионы России ===
  fetch('russia_regions.geojson')
    .then(res => res.json())
    .then(data => {
      map.addSource('russia', { type: 'geojson', data });

      // Базовая заливка
      map.addLayer({
        id: 'russia-fill',
        type: 'fill',
        source: 'russia',
        paint: {
          'fill-color': '#b8d8ff',
          'fill-opacity': 0.6
        }
      });

      // Контуры
      map.addLayer({
        id: 'russia-borders',
        type: 'line',
        source: 'russia',
        paint: {
          'line-color': '#333',
          'line-width': 1
        }
      });

      let selectedRegion = null;

      // При наведении — подсветка
      map.on('mousemove', 'russia-fill', (e) => {
        map.getCanvas().style.cursor = e.features.length ? 'pointer' : '';
      });

      // === Клик по региону ===
      map.on('click', 'russia-fill', (e) => {
        const props = e.features[0].properties;
        const regionName = props.name;
        const pvout = props.pvout;

        selectedRegion = regionName;

        // Подсветка только выбранного региона
        map.setPaintProperty('russia-fill', 'fill-color', [
          'match',
          ['get', 'name'],
          regionName, '#ffd700', // выбранный — золотой
          '#b8d8ff' // остальные — синие
        ]);

        // Плавно приближаем
        map.flyTo({
          center: e.lngLat,
          zoom: 3.8,
          speed: 0.6,
          curve: 1.2
        });

        new maplibregl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(`<b>${regionName}</b><br>PVOUT: ${pvout} кВт·ч/кВтp/год`)
          .addTo(map);

        // Вызываем твой расчёт
        calculateAndDisplay(pvout, regionName);
      });
    })
    .catch(err => console.error("Ошибка загрузки карты:", err));
});


