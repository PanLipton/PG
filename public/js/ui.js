// UI.js - Обробка взаємодії з користувацьким інтерфейсом

// Ініціалізація редактора блок-схем після завантаження DOM
document.addEventListener('DOMContentLoaded', () => {
  // Створення глобального екземпляра редактора
  window.flowchartEditor = new FlowchartEditor();

  setupUIHandlers();
});

function setupUIHandlers() {
  // Кнопка нової блок-схеми
  document.getElementById('newFlowchart').addEventListener('click', () => {
    if (confirm('Створити нову блок-схему? Це очистить всі поточні дані.')) {
      window.flowchartEditor = new FlowchartEditor();
    }
  });

  // Кнопка збереження блок-схеми (показує модальне вікно збереження)
  document.getElementById('saveFlowchart').addEventListener('click', () => {
    const saveModal = new bootstrap.Modal(document.getElementById('saveModal'));
    saveModal.show();
  });

  // Кнопка підтвердження збереження блок-схеми
  document.getElementById('saveFlowchartConfirm').addEventListener('click', () => {
    const name = document.getElementById('flowchartName').value.trim();
    if (!name) {
      alert('Будь ласка, введіть назву для вашої блок-схеми');
      return;
    }

    // Серіалізація даних блок-схеми
    const data = window.flowchartEditor.serialize();
    
    // Відправка на сервер
    fetch('/save-flowchart', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, data })
    })
    .then(response => response.json())
    .then(result => {
      if (result.success) {
        // Закриття модального вікна
        bootstrap.Modal.getInstance(document.getElementById('saveModal')).hide();
        alert('Блок-схему успішно збережено');
      } else {
        alert('Помилка збереження блок-схеми: ' + result.error);
      }
    })
    .catch(error => {
      console.error('Помилка збереження блок-схеми:', error);
      alert('Помилка збереження блок-схеми');
    });
  });

  // Кнопка завантаження блок-схеми (показує модальне вікно завантаження)
  document.getElementById('loadFlowchart').addEventListener('click', () => {
    // Отримання списку збережених блок-схем
    fetch('/flowcharts')
      .then(response => response.json())
      .then(flowcharts => {
        const list = document.getElementById('flowchartsList');
        list.innerHTML = '';
        
        if (flowcharts.length === 0) {
          list.innerHTML = '<p class="text-muted">Збережених блок-схем не знайдено</p>';
        } else {
          flowcharts.forEach(name => {
            const item = document.createElement('button');
            item.className = 'list-group-item list-group-item-action';
            item.textContent = name;
            item.addEventListener('click', () => loadFlowchart(name));
            list.appendChild(item);
          });
        }
        
        const loadModal = new bootstrap.Modal(document.getElementById('loadModal'));
        loadModal.show();
      })
      .catch(error => {
        console.error('Помилка отримання списку блок-схем:', error);
        alert('Помилка завантаження списку блок-схем');
      });
  });

  // Кнопка генерації коду (показує модальне вікно генерації коду)
  document.getElementById('generateCode').addEventListener('click', () => {
    const codeModal = new bootstrap.Modal(document.getElementById('generateCodeModal'));
    codeModal.show();
    
    // Показ заповнювача за замовчуванням
    document.getElementById('generatedCode').textContent = '// Виберіть мову та натисніть "Генерувати код"';
    
    // Додавання обробника зміни мови
    document.getElementById('codeLanguage').addEventListener('change', generateCode);
    
    // Початкова генерація коду
    generateCode();
  });

  // Кнопка завантаження коду
  document.getElementById('downloadCode').addEventListener('click', () => {
    const code = document.getElementById('generatedCode').textContent;
    const language = document.getElementById('codeLanguage').value;
    const extension = getFileExtensionForLanguage(language);
    
    // Створення тимчасового посилання для завантаження
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(code));
    element.setAttribute('download', `згенерований_код${extension}`);
    element.style.display = 'none';
    
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  });

  // Кнопка тестування (показує модальне вікно тестування)
  document.getElementById('testMenu').addEventListener('click', () => {
    const testingModal = new bootstrap.Modal(document.getElementById('testingModal'));
    
    // Завантаження списку тестів
    loadTestList();
    
    testingModal.show();
  });

  // Кнопка збереження тесту
  document.getElementById('saveTest').addEventListener('click', () => {
    const name = document.getElementById('testName').value.trim();
    const input = document.getElementById('testInput').value;
    const expectedOutput = document.getElementById('testExpectedOutput').value;
    
    if (!name) {
      alert('Будь ласка, введіть назву для вашого тесту');
      return;
    }
    
    // Відправка на сервер
    fetch('/save-test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, input, expectedOutput })
    })
    .then(response => response.json())
    .then(result => {
      if (result.success) {
        alert('Тест успішно збережено');
        
        // Очищення форми
        document.getElementById('testName').value = '';
        document.getElementById('testInput').value = '';
        document.getElementById('testExpectedOutput').value = '';
        
        // Перезавантаження списку тестів
        loadTestList();
      } else {
        alert('Помилка збереження тесту: ' + result.error);
      }
    })
    .catch(error => {
      console.error('Помилка збереження тесту:', error);
      alert('Помилка збереження тесту');
    });
  });

  // Кнопка запуску тесту
  document.getElementById('runTest').addEventListener('click', () => {
    const testSelect = document.getElementById('testSelect');
    if (testSelect.options.length === 0) {
      alert('Немає доступних тестів');
      return;
    }
    
    const testName = testSelect.value;
    const flowchartsData = window.flowchartEditor.serialize();
    
    // Показ контейнера результатів
    document.getElementById('testResults').style.display = 'block';
    document.getElementById('testResultContent').innerHTML = 'Виконання тесту...';
    
    document.getElementById('nonDeterministicOptions').style.display = 'none';
    
    // Відправка запиту на запуск тесту
    fetch('/run-test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ flowcharts: flowchartsData, testName })
    })
    .then(response => response.json())
    .then(result => {
      if (result.success) {
        document.getElementById('testResultContent').innerHTML = result.result;
        
        // Перевірка, чи результат вказує на недетермінованість
        if (result.nonDeterministic) {
          document.getElementById('nonDeterministicOptions').style.display = 'block';
        }
      } else {
        document.getElementById('testResultContent').innerHTML = 
          `<div class="alert alert-danger">${result.error}</div>`;
      }
    })
    .catch(error => {
      console.error('Помилка виконання тесту:', error);
      document.getElementById('testResultContent').innerHTML = 
        `<div class="alert alert-danger">Помилка виконання тесту</div>`;
    });
  });

  // Кнопка зупинки тестування (для недетермінованих тестів)
  document.getElementById('stopTesting').addEventListener('click', () => {
    fetch('/stop-test', { method: 'POST' })
      .then(response => response.json())
      .then(result => {
        if (result.success) {
          document.getElementById('testResultContent').innerHTML += 
            `<div class="alert alert-info">Тестування зупинено</div>`;
        }
      })
      .catch(error => {
        console.error('Помилка зупинки тестування:', error);
      });
  });

  // Кнопка перевірки покриття
  document.getElementById('checkCoverage').addEventListener('click', () => {
    const maxOperations = parseInt(document.getElementById('maxOperations').value);
    
    fetch('/check-coverage', { 
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ maxOperations })
    })
    .then(response => response.json())
    .then(result => {
      if (result.success) {
        document.getElementById('coverageResult').innerHTML = 
          `<div class="alert alert-info">Покриття: ${result.coverage}%</div>`;
      } else {
        document.getElementById('coverageResult').innerHTML = 
          `<div class="alert alert-danger">${result.error}</div>`;
      }
    })
    .catch(error => {
      console.error('Помилка перевірки покриття:', error);
      document.getElementById('coverageResult').innerHTML = 
        `<div class="alert alert-danger">Помилка перевірки покриття</div>`;
    });
  });
}

function loadFlowchart(name) {
  console.log(`Loading flowchart: ${name}`);
  fetch(`/load-flowchart/${name}`)
    .then(response => response.json())
    .then(data => {
      // Add debugging
      console.log("Loaded flowchart data:", data);
      console.log("Current thread before loading:", window.flowchartEditor.currentThread);
      
      // Завантаження даних в редактор
      window.flowchartEditor.loadFromJson(data);
      
      console.log("Current thread after loading:", window.flowchartEditor.currentThread);
      
      // Закриття модального вікна
      bootstrap.Modal.getInstance(document.getElementById('loadModal')).hide();
    })
    .catch(error => {
      console.error('Помилка завантаження блок-схеми:', error);
      alert('Помилка завантаження блок-схеми');
    });
}

function generateCode() {
  const language = document.getElementById('codeLanguage').value;
  const flowchartsData = window.flowchartEditor.serialize();
  
  // Відправка запиту на генерацію коду
  fetch('/generate-code', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ flowcharts: flowchartsData, language })
  })
  .then(response => response.json())
  .then(result => {
    if (result.success) {
      document.getElementById('generatedCode').textContent = result.code;
    } else {
      document.getElementById('generatedCode').textContent = `// Помилка: ${result.error}`;
    }
  })
  .catch(error => {
    console.error('Помилка генерації коду:', error);
    document.getElementById('generatedCode').textContent = '// Помилка генерації коду';
  });
}

function loadTestList() {
  fetch('/tests')
    .then(response => response.json())
    .then(tests => {
      const select = document.getElementById('testSelect');
      select.innerHTML = '';
      
      if (tests.length === 0) {
        select.innerHTML = '<option disabled>Немає доступних тестів</option>';
      } else {
        tests.forEach(name => {
          const option = document.createElement('option');
          option.value = name;
          option.textContent = name;
          select.appendChild(option);
        });
      }
    })
    .catch(error => {
      console.error('Помилка завантаження тестів:', error);
    });
}

function getFileExtensionForLanguage(language) {
  const extensions = {
    'python': '.py',
    'c': '.c',
    'cpp': '.cpp',
    'csharp': '.cs',
    'java': '.java'
  };
  
  return extensions[language] || '.txt';
}

// Функція для копіювання згенерованого коду в буфер обміну
document.getElementById('copyCode').addEventListener('click', () => {
  const codeElement = document.getElementById('generatedCode');
  const textArea = document.createElement('textarea');
  textArea.value = codeElement.textContent;
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand('copy');
  document.body.removeChild(textArea);
  
  // Показати повідомлення про успішне копіювання
  alert('Код скопійовано в буфер обміну');
}); 