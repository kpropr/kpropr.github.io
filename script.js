// --- Переменные панели HEVEL HJT ---
const panelPower = 450;     // Вт
const panelCount = 10;      // количество панелей
const systemLoss = 0.85;    // системные потери (15%)
const tariff = 5.5;         // ₽ за кВт·ч

// --- Инициализация карты ---
const map = L.map('map').setView([55.75, 37.61], 5);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '&copy; OpenStreetMap'
}).addTo(map);

// --- Обработка клика ---
map.on('click', async (e) => {
  const { lat, lng } = e.latlng;

  try {
    const res = await fetch(https://globalsolaratlas.info/api/proxy/data?loc=${lat},${lng});
    const data = await res.json();

    if (!data?.annual?.PVOUT_total) {
      alert('Не удалось получить данные с Global Solar Atlas. Попробуйте другую точку.');
      return;
    }

    const pvout = data.annual.PVOUT_total; // кВт·ч/кВтp/год
    const systemPower = (panelPower / 1000) * panelCount; // кВт
    const yearlyGen = pvout * systemPower * systemLoss;
    const yearlySavings = yearlyGen * tariff;

    const resultHTML = 
      <p><strong>Координаты:</strong> ${lat.toFixed(3)}, ${lng.toFixed(3)}</p>
      <p><strong>Инсоляция (PVOUT):</strong> ${pvout} кВт·ч/кВтp/год</p>
      <p><strong>Мощность системы:</strong> ${systemPower.toFixed(2)} кВт</p>
      <p><strong>Годовая выработка:</strong> ${Math.round(yearlyGen).toLocaleString('ru-RU')} кВт·ч</p>
      <p><strong>Годовая экономия:</strong> ${Math.round(yearlySavings).toLocaleString('ru-RU')} ₽</p>
    ;

    document.getElementById('calc-results').innerHTML = resultHTML;

    L.popup()
      .setLatLng([lat, lng])
      .setContent(<b>${Math.round(yearlyGen)} кВт·ч/год</b>)
      .openOn(map);
  } catch (err) {
    console.error('Ошибка получения данных GSA:', err);
    alert('Ошибка получения данных. Проверьте подключение.');
  }
});

// --- Переключатель темы ---
const themeToggle = document.getElementById('theme-toggle');
const body = document.body;

if (localStorage.getItem('theme') === 'dark') {
  body.classList.add('dark');
  themeToggle.textContent = '☀️';
}

themeToggle.addEventListener('click', () => {
  const isDark = body.classList.toggle('dark');
  themeToggle.textContent = isDark ? '☀️' : '🌙';
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
});
