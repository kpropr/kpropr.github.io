import emailjs from 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/+esm';
import IMask from 'https://cdn.jsdelivr.net/npm/imask@7/+esm';

// =================== Конфигурация ===================
const KITS = [
  { id: 'kit-1',  name: 'Комплект 1 кВт',  power_kW: 1,  area_m2: 8,  price_rub: 114990 },
  { id: 'kit-5',  name: 'Комплект 5 кВт',  power_kW: 5,  area_m2: 35, price_rub: 344490 },
  { id: 'kit-10', name: 'Комплект 10 кВт', power_kW: 10, area_m2: 74, price_rub: 677490 }
];

const SYSTEM_LOSS = 0.8;

const APPLIANCES = [
  { id:'kettle', name:'Электрочайник', power_kW:2.0 },
  { id:'microwave', name:'Микроволновка', power_kW:1.5 },
  { id:'iron', name:'Утюг', power_kW:1.8 },
  { id:'stove', name:'Электроплита', power_kW:4.5 },
  { id:'fridge', name:'Холодильник', power_kW:0.2 },
  { id:'ac', name:'Кондиционер', power_kW:1.0 },
  { id:'washer', name:'Стиральная машина', power_kW:2.0 },
  { id:'oven', name:'Духовка', power_kW:2.4 },
  { id:'lighting', name:'Освещение (LED)', power_kW:0.1 },
  { id:'pc', name:'Компьютер', power_kW:0.25 }
];

// =================== Глобальные данные и утилиты ===================
const $ = id => document.getElementById(id);

let citiesData = [];
let selectedCity = null;
let selectedApplianceIds = []; 
let phoneMask = null;
window.currentUserType = "Не указано"; 

function formatNum(n){ return Math.round(n).toLocaleString('ru-RU'); }

function updateSliderFill(slider, textElement) {
    const val = parseFloat(slider.value);
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);
    const percent = ((val - min) / (max - min)) * 100;
    slider.style.setProperty('--percent', percent + '%');
    if(textElement) {
        textElement.style.left = `calc(${percent}% + (${14 - percent * 0.28}px))`;
        textElement.textContent = val; 
    }
}

// =================== Загрузка Городов ===================

function loadCities(regionSelectElement){
  fetch('cities.json')
    .then(r => r.json())
    .then(list => {
      citiesData = list;
      regionSelectElement.innerHTML = '';
      let defaultIndex = 0;
      list.forEach((c,i)=>{
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = c.city; 
        regionSelectElement.appendChild(opt);
        if (c.city.toLowerCase().includes('москв')) defaultIndex = i;
      });
      regionSelectElement.selectedIndex = defaultIndex;
      selectedCity = list[defaultIndex];
      const panelAreaIn = $('panelArea');
      const peakPowerIn = $('peakPower');

      if (panelAreaIn && peakPowerIn && (panelAreaIn.value > 0 || peakPowerIn.value > 0)) {
        runCalculationAndRender();
      }
    })
    .catch(e => console.warn('cities.json не найден', e));
}

// =================== Логика Multiselect ===================
function renderDropdown(appliancesListElement, selectedApplianceIds, toggleAppliance) {
    appliancesListElement.innerHTML = '';
    APPLIANCES.forEach(app => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';        
        if (selectedApplianceIds.includes(app.id)) {
            item.classList.add('selected');
        }
        item.textContent = `${app.name}`;
        item.onclick = (e) => {
            e.stopPropagation(); 
            toggleAppliance(app.id);
        };
        appliancesListElement.appendChild(item);
    });
}

function renderTags(selectedTagsContainerElement, selectedApplianceIds, removeAppliance) {
    selectedTagsContainerElement.innerHTML = '';
    selectedApplianceIds.forEach(id => {
        const app = APPLIANCES.find(a => a.id === id);
        if (!app) return;

        const tag = document.createElement('div');
        tag.className = 'tag-pill';
        const closeBtn = document.createElement('div');
        closeBtn.className = 'tag-close';
        closeBtn.textContent = '✕';
        closeBtn.onclick = () => removeAppliance(id);
        
        tag.textContent = `${app.name} `;
        tag.appendChild(closeBtn);
        selectedTagsContainerElement.appendChild(tag);
    });
}

function toggleAppliance(id, updateUIFromAppliances) {
    if (selectedApplianceIds.includes(id)) {
        selectedApplianceIds = selectedApplianceIds.filter(item => item !== id);
    } else {
        selectedApplianceIds.push(id);
    }
    updateUIFromAppliances();
}

function removeAppliance(id, updateUIFromAppliances) {
    selectedApplianceIds = selectedApplianceIds.filter(item => item !== id);
    updateUIFromAppliances();
}

function updateUIFromAppliances() {
    const selectedTagsContainer = $('selectedTags');
    const appliancesList = $('appliancesList');
    const peakPowerIn = $('peakPower');
    const peakPowerTxt = $('peakVal');

    renderTags(selectedTagsContainer, selectedApplianceIds, (id) => removeAppliance(id, updateUIFromAppliances));
    renderDropdown(appliancesList, selectedApplianceIds, (id) => toggleAppliance(id, updateUIFromAppliances));
    syncPeakFromAppliances(peakPowerIn, peakPowerTxt); 
    runCalculationAndRender(); 
}

function resetAppliances(updateUIFromAppliances) {
    if (selectedApplianceIds.length > 0) {
        selectedApplianceIds = [];
        updateUIFromAppliances();
    }
}

function syncPeakFromAppliances(peakPowerInElement, peakPowerTxtElement){
  if(selectedApplianceIds.length === 0) return; 

  let peakSum = 0;
  selectedApplianceIds.forEach(id => {
      const app = APPLIANCES.find(a => a.id === id);
      if(app) peakSum += app.power_kW;
  });
  
  peakPowerInElement.value = peakSum.toFixed(1);
  updateSliderFill(peakPowerInElement, peakPowerTxtElement);
}

// =================== Функции Формы (Глобальные) ===================

window.showRequestForm = function() {
    const showFormBtn = $('showFormBtn');
    const requestForm = $('requestForm');
    
    if(!showFormBtn || !requestForm) return;

    showFormBtn.style.display = 'none';
    requestForm.style.display = 'flex';

    const userPhoneInput = $('userPhone');
    if (userPhoneInput && !phoneMask) {
        phoneMask = IMask(userPhoneInput, {
            mask: '+{7} (000) 000-00-00',
            lazy: false, 
            overwrite: true,
            autofix: true,
        });
        userPhoneInput.focus();
    }
};

window.sendFinalRequest = function(calculatedParams) {
    const userNameInput = $('userName');
    const userPhoneInput = $('userPhone');
    const userEmailInput = $('userEmail'); 
    
    if(!userNameInput || !userPhoneInput || !userEmailInput) return;

    const name = userNameInput.value.trim();
    const phone = phoneMask ? phoneMask.unmaskedValue : userPhoneInput.value.trim().replace(/\D/g,'');
    const email = userEmailInput.value.trim();
    
    if(!name || phone.length < 10) { 
        alert("Пожалуйста, введите имя и корректный номер телефона.");
        return;
    }
    
    const templateParams = {
        kit_name: calculatedParams.kit_name,
        calculated_price: formatNum(calculatedParams.calculated_price),
        area_m2: calculatedParams.area_m2,
        power_kW: calculatedParams.power_kW,
        goal_type: calculatedParams.goal_type,
        appliances_list: calculatedParams.appliances_list,
        city_name: calculatedParams.city_name,
        
        user_name: name,
        user_phone: phoneMask ? phoneMask.value : userPhoneInput.value,
        user_email: email || 'Не указан',
        user_type: window.currentUserType,
    };

    emailjs.send('service_h7p8kf9', 'template_ha9iwvu', templateParams)
        .then(() => {
            alert(`Спасибо, ${name}! Ваша заявка принята. Менеджер свяжется с вами.`);
            const requestForm = $('requestForm');
            const showFormBtn = $('showFormBtn');
            if(requestForm) requestForm.style.display = 'none';
            if(showFormBtn) showFormBtn.style.display = 'block';
            
            userNameInput.value = '';
            userEmailInput.value = '';
            if(phoneMask) phoneMask.value = '';
        })
        .catch((err) => {
             console.error('Ошибка отправки:', err);
             alert('Произошла ошибка при отправке заявки. Попробуйте позже.');
        });
};

// =================== Основной Расчет ===================
function runCalculationAndRender(){
  const panelAreaIn = $('panelArea');
  const peakPowerIn = $('peakPower');
  const regionSelect = $('regionSelect');
  const resultsSection = $('resultsSection');
  const panelAreaTxt = $('panelAreaVal');
  const peakPowerTxt = $('peakVal');
    
  if (!panelAreaIn || !peakPowerIn || !regionSelect || !resultsSection || !panelAreaTxt || !peakPowerTxt) {
      console.error("Не удалось найти все необходимые элементы DOM для расчета.");
      return; 
  }

  const area = Number(panelAreaIn.value);
  const peak = Number(peakPowerIn.value);
  
  updateSliderFill(panelAreaIn, panelAreaTxt);
  updateSliderFill(peakPowerIn, peakPowerTxt);

  const selectedGoalRadio = document.querySelector('input[name="goalType"]:checked');
  const goalText = selectedGoalRadio ? selectedGoalRadio.nextElementSibling.textContent.trim() : "Не выбрана";

  if (area === 0 || peak === 0) {
    resultsSection.innerHTML = `
        <div class="placeholder-box">
            <div class="placeholder-text">
                Укажите площадь вашего объекта и пиковую мощность,<br>
                и мы подберём для вас оптимальный готовый комплект
            </div>
        </div>`;
    return; 
  }

  const tariff = selectedCity ? (selectedCity.tariff || 5) : 5;
  const pvout = selectedCity ? (selectedCity.pvout || 1100) : 1100;

  const requiredPower = peak * 0.8;
  let idealKit = KITS.find(k => k.power_kW >= requiredPower);
  if (!idealKit) idealKit = KITS[KITS.length - 1];

  let finalKit = idealKit;
  let isDowngraded = false;

  if (area < idealKit.area_m2) {
     const possibleKits = [...KITS].reverse().filter(k => k.area_m2 <= area);
     if (possibleKits.length > 0) {
         finalKit = possibleKits[0];
         isDowngraded = true;
     } else {
         resultsSection.innerHTML = `
            <div class="error-message">
                К сожалению, под указанную площадь (${area} м²) невозможно установить ни один стандартный комплект.<br>
                Минимально необходимая площадь: ${KITS[0].area_m2} м².
            </div>
         `;
         return;
     }
  }
  const annualGen = finalKit.power_kW * pvout * SYSTEM_LOSS; 
  const savings = annualGen * tariff;
  
  let warningHTML = '';
  if (isDowngraded) {
      warningHTML = `<p style="color:#d9534f; font-size:16px;">
        <em>⚠️ Площадь не позволяет установить комплект ${idealKit.power_kW} кВт. 
        Подобран вариант меньше.</em>
      </p>`;
  }
    const selectedApplianceNames = selectedApplianceIds.map(id => {
      const app = APPLIANCES.find(a => a.id === id);
      return app ? app.name : '';
  }).filter(name => name.length > 0).join(', ');
  
  const cityText = selectedCity ? selectedCity.city : 'Не выбран';
  
  const calculatedParams = {
      kit_name: finalKit.name,
      calculated_price: finalKit.price_rub,
      area_m2: finalKit.area_m2,
      power_kW: finalKit.power_kW,
      goal_type: goalText,
      appliances_list: selectedApplianceNames || 'Не указаны',
      city_name: cityText
  };
  
  const calculatedParamsJSON = JSON.stringify(calculatedParams).replace(/'/g, "\\'");


  resultsSection.innerHTML = `
    <div class="result-panel">
        <div class="result-info">
            <h2>${finalKit.name}</h2>
            <p style="margin-bottom:5px; color:#666;">Цель: <strong>${goalText}</strong></p>
            <p>Площадь панелей: <strong>${finalKit.area_m2} м²</strong></p>
            <p>Выработка: <strong>${formatNum(annualGen)} кВт·ч/год</strong></p>
            <p>Экономия: <strong>${formatNum(savings)} ₽/год</strong></p>
            ${warningHTML}
            <div class="price">${formatNum(finalKit.price_rub)} ₽</div>
            
            <button class="primary-btn order-btn" id="showFormBtn" onclick="showRequestForm()">
                Оставить заявку
            </button>

            <div id="requestForm" class="request-form-hidden">
                <input type="text" id="userName" placeholder="Ваше имя">
                <input type="email" id="userEmail" placeholder="Ваш Email (необязательно)">
                <input type="text" id="userPhone" placeholder="+7 (___) ___-__-__"> 
                <button class="primary-btn order-btn" 
                    onclick='sendFinalRequest(${calculatedParamsJSON})'>
                    Отправить менеджеру
                </button>
            </div>
        </div>
        <div class="result-image-block">
            <img src="img/${finalKit.id}.jpg" alt="${finalKit.name}" onerror="this.src='https://via.placeholder.com/800x600?text=SUNCALC+KIT'">
        </div>
    </div>
  `;
}

// =================== Инициализация ===================
document.addEventListener('DOMContentLoaded', ()=>{
    const panelAreaIn = $('panelArea');
    const panelAreaTxt = $('panelAreaVal');
    const peakPowerIn = $('peakPower');
    const peakPowerTxt = $('peakVal');
    const regionSelect = $('regionSelect');
    const appliancesBtn = $('appliancesBtn');
    const appliancesList = $('appliancesList');
    const selectedTagsContainer = $('selectedTags');

    if (!panelAreaIn || !peakPowerIn || !regionSelect || !appliancesBtn || !appliancesList) {
        console.error("Критическая ошибка: не найдены ключевые элементы интерфейса. Проверьте calculator.html");
        return;
    }    
    
    emailjs.init({
        publicKey: "WG50t7OIdHKqLSsWW", 
    });
    console.log("EmailJS инициализирован.");
    
    loadCities(regionSelect); 
    updateSliderFill(panelAreaIn, panelAreaTxt);
    updateSliderFill(peakPowerIn, peakPowerTxt);
    
    const updateUI = () => updateUIFromAppliances();
    const goalRadioButtons = document.querySelectorAll('input[name="goalType"]');
    
    goalRadioButtons.forEach(radio => radio.addEventListener('change', runCalculationAndRender));
    panelAreaIn.addEventListener('input', runCalculationAndRender);
    peakPowerIn.addEventListener('input', (e)=>{
        if (e.isTrusted) resetAppliances(updateUI); 
        runCalculationAndRender();
    });
    
    regionSelect.addEventListener('change', ()=>{
        const idx = parseInt(regionSelect.value, 10);
        selectedCity = citiesData[idx];
        if(panelAreaIn.value > 0 || peakPowerIn.value > 0) runCalculationAndRender();
    });

  
    appliancesBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        renderDropdown(appliancesList, selectedApplianceIds, (id) => toggleAppliance(id, updateUI));
        appliancesList.classList.toggle('show');
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.multiselect-container')) {
            appliancesList.classList.remove('show');
        }
    });

 
    updateUI(); 


    const modal = document.getElementById("userTypeModal");
    const modalBtns = document.querySelectorAll(".modal-btn");
    
    modalBtns.forEach(btn => {
        btn.addEventListener("click", (e) => {
            window.currentUserType = e.target.textContent; 
            modal.style.display = "none";
        });
    });
});
