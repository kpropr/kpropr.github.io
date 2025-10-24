// Глобальная переменная для хранения данных из JSON
let panelData = {};

// Условные данные для расчетов (можно настроить)
const SIM_HOURS = 1400; // Суммарный Инсоляционный Модуль (эффективные солнечные часы в год)
const ELECTRICITY_TARIFF = 5.5; // Тариф на электроэнергию (руб/кВт·ч)
const SYSTEM_LOSS_FACTOR = 0.85; // Коэффициент системных потерь (15%)

// 1. Функция для загрузки данных из JSON
async function loadPanelData() {
    try {
        // Используем fetch для загрузки локального JSON-файла
        const response = await fetch('hevel_modules.json');
        panelData = await response.json();
        
        // Запускаем первый расчет, чтобы показать не-нулевые данные
        calculateAndDisplay(); 
        console.log("Данные HEVEL успешно загружены.");

    } catch (error) {
        console.error("Ошибка загрузки данных HEVEL. Проверьте, запущен ли live-server:", error);
    }
}

// 2. Основная функция для расчета и обновления интерфейса
function calculateAndDisplay() {
    // === СЧИТЫВАНИЕ ВХОДНЫХ ДАННЫХ ИЗ ИНТЕРФЕЙСА ===
    const selectedModelId = document.getElementById('panel-model').value;
    const countInput = document.getElementById('count');
    const tempInput = document.getElementById('temp');
    
    // Преобразование в числа
    const count = parseInt(countInput.value);
    const roofTemp = parseInt(tempInput.value);
    
    // Получение данных по выбранной модели (HJT или Standard)
    const module = panelData[selectedModelId];

    // Проверка на корректность данных
    if (!module || isNaN(count) || count === 0) {
        console.error("Данные модуля не найдены или количество равно нулю.");
        return; 
    }

    // === БАЗОВЫЕ ЭКОНОМИЧЕСКИЕ РАСЧЕТЫ ===
    
    // Общая мощность системы (Вт)
    const totalPowerWatts = module.max_power * count; 
    const totalPowerKW = totalPowerWatts / 1000;
    
    // Годовая выработка (кВт·ч)
    const yearlyGeneration = totalPowerKW * SIM_HOURS * SYSTEM_LOSS_FACTOR; 
    
    // Годовая экономия/прибыль
    const yearlySavings = yearlyGeneration * ELECTRICITY_TARIFF;

    // Общая стоимость системы (упрощенно: только панели)
    const totalSystemCost = module.price_rub * count;
    
    // Срок окупаемости (для демонстрации)
    const paybackPeriod = yearlySavings > 0 ? totalSystemCost / yearlySavings : 'N/A';

    // === РАСЧЕТ ПАДЕНИЯ МОЩНОСТИ (Сравнение HEVEL HJT vs Standard) ===
    
    // Функция расчета фактической мощности при заданной температуре
    function calculatePowerDrop(modelId, temp) {
        const model = panelData[modelId];
        const tempDelta = temp - 25; // Разница относительно STC (25°C)
        
        // Падение мощности в процентах: (температурный коэффициент * дельта температуры)
        const powerDropPercent = tempDelta * model.temp_coeff; 
        
        // Фактическая мощность
        const actualPower = model.max_power * (1 + powerDropPercent / 100);
        
        return {
            actualPower: Math.round(actualPower),
            powerDrop: Math.round(powerDropPercent * 10) / 10 
        };
    }
    
    // Получаем результаты для обеих технологий при текущей температуре
    const hevelResult = calculatePowerDrop('HVL-450-HJT', roofTemp);
    const standardResult = calculatePowerDrop('Standard-PERC', roofTemp);
    
    // Разница в процентах
    const percentBetter = ((hevelResult.actualPower / standardResult.actualPower) - 1) * 100;

    // Формирование HTML для блока сравнения
    let comparisonOutputHTML = `
        <p><strong>Температура: ${roofTemp}°C</strong></p>
        <p>Панель HEVEL (${panelData['HVL-450-HJT'].max_power} Вт): ${hevelResult.actualPower} Вт (потеря: ${hevelResult.powerDrop}%)</p>
        <p>Стандартная панель (${panelData['Standard-PERC'].max_power} Вт): ${standardResult.actualPower} Вт (потеря: ${standardResult.powerDrop}%)</p>
        <p class="highlight">🔥 HEVEL вырабатывает на <strong>${Math.round(percentBetter)}%</strong> больше энергии при ${roofTemp}°C!</p>
    `;


    // === ОБНОВЛЕНИЕ ИНТЕРФЕЙСА ===
    document.getElementById('total-power').textContent = Math.round(totalPowerKW * 10) / 10 + ' кВт';
    document.getElementById('yearly-generation').textContent = Math.round(yearlyGeneration).toLocaleString('ru-RU');
    document.getElementById('yearly-savings').textContent = Math.round(yearlySavings).toLocaleString('ru-RU') + ' ₽';
    document.getElementById('payback-period').textContent = typeof paybackPeriod === 'number' ? Math.round(paybackPeriod * 10) / 10 + ' лет' : paybackPeriod;

    document.getElementById('comparison-output').innerHTML = comparisonOutputHTML;
}

// 3. Обработчики событий (Запуск при взаимодействии)
document.addEventListener('DOMContentLoaded', () => {
    // Загружаем данные JSON при старте
    loadPanelData();

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
    document.getElementById('panel-model').addEventListener('change', calculateAndDisplay);
    
    setupInputListeners('count', 'count-value');
    setupInputListeners('temp', 'temp-value');

    // Модели-вьюеры не требуют слушателей, они работают автоматически
});
// === КАРТА РЕГИОНОВ РОССИИ ДЛЯ РАСЧЁТА ===

// Загружаем данные по регионам (pvout)
let regions = {};
fetch('regions.json')
  .then(r => r.json())
  .then(data => {
    regions = data;
    console.log("Данные по регионам успешно загружены.");
  })
  .catch(err => console.error("Ошибка загрузки regions.json:", err));

// При выборе региона — подставляем pvout и пересчитываем
document.addEventListener('DOMContentLoaded', () => {
  const svgMap = document.getElementById('svgmap');
  const pvoutDisplay = document.getElementById('pvout-value');

  if (!svgMap) return;

  svgMap.querySelectorAll('.region').forEach(regionPath => {
    regionPath.addEventListener('click', () => {
      const regionId = regionPath.dataset.region;
      const region = regions[regionId];
      if (!region) return;

      // Подсветка выбранного региона
      svgMap.querySelectorAll('.region').forEach(p => p.classList.remove('selected'));
      regionPath.classList.add('selected');

      // Показываем текущее значение PVOUT
      if (pvoutDisplay) pvoutDisplay.textContent = ${region.pvout} кВт·ч/кВтp/год;

      // Перезапускаем расчёт с новым значением инсоляции
      calculateAndDisplayRegion(region.pvout, region.name);
    });
  });
});

// Основная функция расчёта с учётом региона
function calculateAndDisplayRegion(pvout, regionName) {
  const count = parseInt(document.getElementById('count').value);
  const module = panelData['HVL-450-HJT']; // только HEVEL

  if (!module  isNaN(count)  count === 0) {
    console.error("Некорректные данные для расчёта региона.");
    return;
  }

  // расчёты
  const totalPowerKW = (module.max_power * count) / 1000;
  const yearlyGeneration = totalPowerKW * pvout * SYSTEM_LOSS_FACTOR;
  const yearlySavings = yearlyGeneration * ELECTRICITY_TARIFF;

  // вывод
  const resultsBox = document.getElementById('comparison-output');
  resultsBox.innerHTML = 
    <h3>${regionName} регион</h3>
    <p><strong>Инсоляция (PVOUT):</strong> ${pvout} кВт·ч/кВтp/год</p>
    <p><strong>Мощность системы:</strong> ${totalPowerKW.toFixed(2)} кВт</p>
    <p><strong>Годовая выработка:</strong> ${Math.round(yearlyGeneration).toLocaleString('ru-RU')} кВт·ч</p>
    <p><strong>Годовая экономия:</strong> ${Math.round(yearlySavings).toLocaleString('ru-RU')} ₽/год</p>
  ;
}



