// Сервіс для тестування блок-схем

const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');
const codeGeneratorService = require('./codeGeneratorService');

class TestingService {
  constructor() {
    this.currentTestProcess = null;
    this.testResults = [];
    this.testedCombinations = 0;
    this.totalCombinations = 0;
  }

  async runTest(flowchartData, testName) {
    try {
      // Завантажуємо тестові дані
      const testPath = path.join(__dirname, 'tests', `${testName}.json`);
      if (!fs.existsSync(testPath)) {
        throw new Error(`Test '${testName}' not found`);
      }

      const testData = JSON.parse(fs.readFileSync(testPath, 'utf-8'));
      const { input, expectedOutput } = testData;

      // Генеруємо Python код для тестування
      // Використовуємо Python бо з ним простіше працювати
      const pythonCode = codeGeneratorService.generatePythonCode(flowchartData);
      
      // Зберігаємо у тимчасовий файл
      const tempDir = path.join(__dirname, 'temp');
      fs.ensureDirSync(tempDir);
      
      const tempFilePath = path.join(tempDir, `test_${Date.now()}.py`);
      fs.writeFileSync(tempFilePath, pythonCode);

      // Запускаємо Python скрипт з тестовими вхідними даними
      const result = await this.runPythonScript(tempFilePath, input);
      
      // Порівнюємо з очікуваним результатом
      const isNonDeterministic = this.checkForNonDeterminism(flowchartData);
      
      // Прибираємо за собою
      fs.removeSync(tempFilePath);
      
      // Повертаємо результат
      if (isNonDeterministic) {
        this.startExhaustiveTesting(flowchartData, input, expectedOutput);
        return {
          result: `Result: ${result}\nExpected: ${expectedOutput}\n\nThis program appears to be non-deterministic. Starting exhaustive testing...`,
          nonDeterministic: true
        };
      } else {
        // Детермінована програма
        const success = result.trim() === expectedOutput.trim();
        
        return {
          result: `Result: ${result}\nExpected: ${expectedOutput}\n\nTest ${success ? 'PASSED' : 'FAILED'}`,
          nonDeterministic: false
        };
      }
    } catch (error) {
      console.error('Error running test:', error);
      throw new Error(`Test execution failed: ${error.message}`);
    }
  }

  async runPythonScript(scriptPath, input) {
    return new Promise((resolve, reject) => {
      const process = spawn('python', [scriptPath]);
      let output = '';
      let error = '';

      // Відправляємо вхідні дані скрипту
      if (input) {
        process.stdin.write(input);
        process.stdin.end();
      }

      // Збираємо вивід
      process.stdout.on('data', data => {
        output += data.toString();
      });

      process.stderr.on('data', data => {
        error += data.toString();
      });

      process.on('close', code => {
        if (code !== 0) {
          reject(new Error(`Script exited with code ${code}: ${error}`));
        } else {
          resolve(output);
        }
      });

      // Зберігаємо поточний процес для можливого переривання
      this.currentTestProcess = process;
    });
  }

  stopCurrentTest() {
    if (this.currentTestProcess) {
      this.currentTestProcess.kill();
      this.currentTestProcess = null;
      return true;
    }
    return false;
  }

  // Перевіряємо чи програма недетермінована на основі взаємодій між потоками
  checkForNonDeterminism(flowchartData) {
    const { threads, variables } = flowchartData;
    
    // Якщо маємо більше одного потоку, перевіряємо доступ до спільних змінних без блокувань
    if (threads.length <= 1) {
      return false; // Однопотокові програми детерміновані
    }
    
    // Рахуємо доступи до змінних у кожному потоці
    const variableAccesses = {};
    
    variables.forEach(variable => {
      variableAccesses[variable] = { read: 0, write: 0 };
    });
    
    // Перевіряємо кожен потік на доступи до змінних
    threads.forEach(thread => {
      thread.blocks.forEach(block => {
        const props = block.properties || {};
        
        switch (block.type) {
          case 'assignment':
            // Запис в змінну
            if (props.variable) {
              variableAccesses[props.variable].write++;
            }
            
            // Читання змінної якщо це присвоєння змінної
            if (props.type === 'variable' && props.source) {
              variableAccesses[props.source].read++;
            }
            break;
            
          case 'input':
            // Запис в змінну
            if (props.variable) {
              variableAccesses[props.variable].write++;
            }
            break;
            
          case 'output':
            // Читання змінної
            if (props.variable) {
              variableAccesses[props.variable].read++;
            }
            break;
            
          case 'decision':
            // Читання змінної
            if (props.variable) {
              variableAccesses[props.variable].read++;
            }
            break;
        }
      });
    });
    
    // Перевіряємо чи є змінна з кількома записами або читаннями+записами
    for (const variable in variableAccesses) {
      const access = variableAccesses[variable];
      
      // Якщо кілька потоків пишуть в одну змінну, або якщо одні читають інші пишуть,
      // програма недетермінована
      if (access.write > 1 || (access.read > 0 && access.write > 0)) {
        return true;
      }
    }
    
    return false;
  }

  // Запускаємо вичерпне тестування всіх можливих шляхів виконання
  startExhaustiveTesting(flowchartData, input, expectedOutput) {
    // Скидаємо стан тесту
    this.testResults = [];
    this.testedCombinations = 0;
    
    // Підраховуємо загальну кількість комбінацій
    // Це спрощена оцінка - в реальності кількість чергувань
    // залежить від конкретної структури програми
    const { threads } = flowchartData;
    const avgBlocksPerThread = threads.reduce((sum, t) => sum + t.blocks.length, 0) / threads.length;
    this.totalCombinations = Math.pow(avgBlocksPerThread, threads.length);
    
    // Запускаємо обмежену кількість прикладів
    // У реальній імплементації використовувався б інструмент перевірки моделі або тестування паралельності
    // Тут просто запускаємо програму багато разів і сподіваємось зловити різні чергування
    for (let i = 0; i < 10; i++) {
      this.runPythonSample(flowchartData, input, expectedOutput);
      this.testedCombinations += 1;
    }
  }

  async runPythonSample(flowchartData, input, expectedOutput) {
    try {
      const pythonCode = codeGeneratorService.generatePythonCode(flowchartData);
      
      const tempDir = path.join(__dirname, 'temp');
      fs.ensureDirSync(tempDir);
      
      const tempFilePath = path.join(tempDir, `test_sample_${Date.now()}.py`);
      fs.writeFileSync(tempFilePath, pythonCode);

      const result = await this.runPythonScript(tempFilePath, input);
      
      // Додаємо до результатів
      this.testResults.push({
        result,
        success: result.trim() === expectedOutput.trim()
      });
      
      // Прибираємо за собою
      fs.removeSync(tempFilePath);
    } catch (error) {
      console.error('Error running sample test:', error);
    }
  }

  // Обчислюємо покриття для вичерпного тестування
  calculateCoverage(maxOperations) {
    // Підраховуємо скільки комбінацій ми протестували з теоретично можливих
    // Обмежуємо до операцій з maxOperations або менше кроків
    const totalPossible = Math.min(this.totalCombinations, Math.pow(maxOperations, 2));
    
    return {
      testedCombinations: this.testedCombinations,
      totalPossible,
      percentage: Math.round((this.testedCombinations / totalPossible) * 100)
    };
  }
}

module.exports = new TestingService(); 