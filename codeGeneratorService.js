// Сервіс для генерації коду з блок-схеми

const fs = require('fs-extra');
const path = require('path');

class CodeGeneratorService {
  constructor() {
    this.generators = {
      'python': this.generatePythonCode.bind(this),
      'csharp': this.generateCSharpCode.bind(this)
    };
  }

  generateCode(flowchartData, language) {
    // Перевіряємо чи підтримується мова
    if (!this.generators[language]) {
      throw new Error(`Unsupported language: ${language}`);
    }

    try {
      // Викликаємо потрібний генератор залежно від мови
      const code = this.generators[language](flowchartData);
      
      // Зберігаємо згенерований код у файл
      const outputDir = path.join(__dirname, 'generated_code');
      fs.ensureDirSync(outputDir);
      
      const fileName = `generated_code_${new Date().getTime()}.${this.getFileExtension(language)}`;
      const outputPath = path.join(outputDir, fileName);
      
      fs.writeFileSync(outputPath, code);
      
      return code;
    } catch (error) {
      console.error('Error generating code:', error);
      throw new Error(`Code generation failed: ${error.message}`);
    }
  }

  // Генерація Python коду з даних блок-схеми
  generatePythonCode(data) {
    const { threads, variables } = data;
    
    let code = `#!/usr/bin/env python3
# Згенерований код з блок-схеми
import threading
import time

# Спільні змінні
lock = threading.Lock()
`;

    // Оголошуємо спільні змінні
    variables.forEach(variable => {
      code += `${variable} = 0\n`;
    });

    code += '\n';
    
    // Генеруємо функції потоків
    threads.forEach(thread => {
      code += `def thread_${thread.id}():\n`;
      code += `    global ${variables.join(', ')}\n\n`;
      
      // Перетворюємо блоки на код
      const blockMap = new Map(thread.blocks.map(block => [block.id, block]));
      const connectionMap = new Map();
      
      // Створюємо мапу з'єднань
      thread.connections.forEach(conn => {
        if (!connectionMap.has(conn.source)) {
          connectionMap.set(conn.source, []);
        }
        connectionMap.get(conn.source).push(conn);
      });
      
      // Шукаємо стартовий блок
      const startBlock = thread.blocks.find(block => block.type === 'start');
      if (!startBlock) {
        code += '    # Стартовий блок не знайдено\n';
        code += '    pass\n\n';
      } else {
        // Генеруємо код зі стартового блоку
        let threadCode = '';
        threadCode = this.generatePythonBlockCode(
          startBlock, 
          blockMap, 
          connectionMap, 
          '    ', 
          new Set(), 
          threadCode,
          false // Початково не в блоці lock
        );
        code += threadCode;
      }
      
      code += '\n';
    });
    
    // Створюємо та запускаємо потоки
    code += '# Створюємо потоки\n';
    threads.forEach(thread => {
      code += `t${thread.id} = threading.Thread(target=thread_${thread.id})\n`;
    });
    
    code += '\n# Запускаємо потоки\n';
    threads.forEach(thread => {
      code += `t${thread.id}.start()\n`;
    });
    
    code += '\n# Чекаємо завершення потоків\n';
    threads.forEach(thread => {
      code += `t${thread.id}.join()\n`;
    });
    
    return code;
  }
  
  // Допоміжна функція для генерації Python коду для блоку та його наступників
  generatePythonBlockCode(block, blockMap, connectionMap, indent, visited, codeAcc, isInsideLock = false) {
    // Перевіряємо чи ми вже відвідували цей блок, щоб уникнути безкінечних циклів
    if (visited.has(block.id)) {
      codeAcc += `${indent}# Перехід до блоку ${block.id} (вже оброблений)\n`;
      return codeAcc;
    }
    
    // Позначаємо як відвіданий
    visited.add(block.id);
    
    // Генеруємо код залежно від типу блоку
    switch (block.type) {
      case 'start':
        // Нічого особливого для стартового блоку
        break;
        
      case 'end':
        // Не додаємо return для кращого слідування блок-схемі
        break;
        
      case 'assignment':
        const assignProps = block.properties;
        
        if (assignProps.type === 'variable') {
          if (!isInsideLock) {
            codeAcc += `${indent}with lock:\n`;
            codeAcc += `${indent}    ${assignProps.variable} = ${assignProps.source}\n`;
          } else {
            codeAcc += `${indent}${assignProps.variable} = ${assignProps.source}\n`;
          }
        } else {
          if (!isInsideLock) {
            codeAcc += `${indent}with lock:\n`;
            codeAcc += `${indent}    ${assignProps.variable} = ${assignProps.value}\n`;
          } else {
            codeAcc += `${indent}${assignProps.variable} = ${assignProps.value}\n`;
          }
        }
        break;
        
      case 'input':
        const inputProps = block.properties;
        codeAcc += `${indent}${inputProps.variable} = int(input("Enter ${inputProps.variable}: "))\n`;
        break;
        
      case 'output':
        const outputProps = block.properties;
        
        if (!isInsideLock) {
          codeAcc += `${indent}with lock:\n`;
          codeAcc += `${indent}    print(${outputProps.variable})\n`;
        } else {
          codeAcc += `${indent}print(${outputProps.variable})\n`;
        }
        break;
        
      case 'decision':
        const decisionProps = block.properties;
        const comparisonOp = decisionProps.comparison === 'equal' ? '==' : '<';
        
        codeAcc += `${indent}with lock:\n`;
        codeAcc += `${indent}    if ${decisionProps.variable} ${comparisonOp} ${decisionProps.value}:\n`;
        
        // Шукаємо з'єднання 'так' (зазвичай з Right)
        const yesConnections = connectionMap.get(block.id) || [];
        const yesConn = yesConnections.find(c => c.sourceEndpoint === 'Right');
        
        let yesBranchCode = '';
        
        if (yesConn && blockMap.has(yesConn.target)) {
          // Додаємо коментар для гілки "так"
          yesBranchCode += `${indent}        # Yes branch\n`;
          // Обробляємо гілку 'так' зі збільшеним відступом
          yesBranchCode = this.generatePythonBlockCode(
            blockMap.get(yesConn.target),
            blockMap,
            connectionMap,
            indent + '        ',
            new Set(visited),
            yesBranchCode,
            true // В середині блоку lock
          );
        } else {
          yesBranchCode += `${indent}        pass  # No Yes branch connected\n`;
        }
        
        codeAcc += yesBranchCode;
        codeAcc += `${indent}    else:\n`;
        
        // Шукаємо з'єднання 'ні' (зазвичай з Bottom)
        const noConn = yesConnections.find(c => c.sourceEndpoint === 'Bottom');
        
        let noBranchCode = '';
        
        if (noConn && blockMap.has(noConn.target)) {
          // Додаємо коментар для гілки "ні"
          noBranchCode += `${indent}        # No branch\n`;
          // Обробляємо гілку 'ні' зі збільшеним відступом
          noBranchCode = this.generatePythonBlockCode(
            blockMap.get(noConn.target),
            blockMap,
            connectionMap,
            indent + '        ',
            new Set(visited),
            noBranchCode,
            true // В середині блоку lock
          );
        } else {
          noBranchCode += `${indent}        pass  # No No branch connected\n`;
        }
        
        codeAcc += noBranchCode;
        
        // Для блок-схеми потрібно перейти до наступного блоку після decision
        const afterDecisionConnections = connectionMap.get(block.id) || [];
        const afterDecisionConn = afterDecisionConnections.find(c => 
          c.sourceEndpoint !== 'Right' && c.sourceEndpoint !== 'Bottom');
        
        if (afterDecisionConn && blockMap.has(afterDecisionConn.target)) {
          // Обробляємо наступний блок після decision
          const blockAfterDecision = blockMap.get(afterDecisionConn.target);
          if (!visited.has(blockAfterDecision.id)) {
            codeAcc = this.generatePythonBlockCode(
              blockAfterDecision,
              blockMap,
              connectionMap,
              indent,
              visited,
              codeAcc
            );
          }
        }
        
        return codeAcc;
    }
    
    // Шукаємо наступні блоки для обробки (для не-decision блоків)
    const nextConnections = connectionMap.get(block.id) || [];
    
    if (nextConnections.length > 0) {
      // Отримуємо перше з'єднання (в послідовності)
      const nextConn = nextConnections[0];
      
      if (nextConn && blockMap.has(nextConn.target)) {
        // Обробляємо наступний блок
        codeAcc = this.generatePythonBlockCode(
          blockMap.get(nextConn.target),
          blockMap,
          connectionMap,
          indent,
          visited,
          codeAcc,
          isInsideLock
        );
      }
    }
    
    return codeAcc;
  }
  
  // Генерація C коду з даних блок-схеми
  generateCCode(data) {
    // Схожа структура до генератора Python коду, але для C
    const { threads, variables } = data;
    
    let code = `// Згенерований код з блок-схеми
#include <stdio.h>
#include <stdlib.h>
#include <pthread.h>

// Спільні змінні
`;
    
    // Оголошуємо спільні змінні
    variables.forEach(variable => {
      code += `int ${variable} = 0;\n`;
    });
    
    code += '\npthr_mutex_t lock;\n\n';
    
    // Генеруємо функції потоків
    threads.forEach(thread => {
      code += `void* thread_${thread.id}(void* arg) {\n`;
      
      // Додаємо код потоку тут (схожа структура до генератора Python)
      code += `    // Реалізація потоку ${thread.id}\n`;
      
      // Шукаємо стартовий блок
      const startBlock = thread.blocks.find(block => block.type === 'start');
      
      // Тут би був код для генерації C блоків
      
      code += `    return NULL;\n`;
      code += `}\n\n`;
    });
    
    code += 'int main() {\n';
    code += '    pthread_mutex_init(&lock, NULL);\n\n';
    
    // Створюємо та запускаємо потоки
    code += '    // Створюємо потоки\n';
    code += `    pthread_t threads[${threads.length}];\n`;
    threads.forEach((thread, i) => {
      code += `    pthread_create(&threads[${i}], NULL, thread_${thread.id}, NULL);\n`;
    });
    
    code += '\n    // Чекаємо на завершення потоків\n';
    threads.forEach((thread, i) => {
      code += `    pthread_join(threads[${i}], NULL);\n`;
    });
    
    code += '\n    pthread_mutex_destroy(&lock);\n';
    code += '    return 0;\n';
    code += '}\n';
    
    return code;
  }
  
  // Генерація C++ коду
  generateCppCode(data) {
    // Реалізація для генерації C++ коду
    return '// C++ код генерації ще не повністю реалізований';
  }
  
  // Генерація C# коду
  generateCSharpCode(data) {
    const { threads, variables } = data;
    
    let code = `// Згенерований код з блок-схеми
using System;
using System.Threading;
using System.Threading.Tasks;

namespace FlowchartGeneratedCode
{
    class Program
    {
        // Спільні змінні
        private static object _lock = new object();
`;

    // Оголошуємо спільні змінні
    variables.forEach(variable => {
      code += `        private static int ${variable} = 0;\n`;
    });

    code += '\n        static void Main(string[] args)\n';
    code += '        {\n';
    
    // Створюємо та запускаємо потоки
    code += '            // Створюємо та запускаємо потоки\n';
    code += '            var tasks = new Task[]\n';
    code += '            {\n';
    
    threads.forEach(thread => {
      code += `                Task.Run(() => Thread_${thread.id}()),\n`;
    });
    
    code += '            };\n\n';
    code += '            // Чекаємо завершення всіх потоків\n';
    code += '            Task.WaitAll(tasks);\n';
    code += '        }\n\n';
    
    // Генеруємо методи потоків
    threads.forEach(thread => {
      code += `        static void Thread_${thread.id}()\n`;
      code += '        {\n';
      
      // Перетворюємо блоки на код
      const blockMap = new Map(thread.blocks.map(block => [block.id, block]));
      const connectionMap = new Map();
      
      // Створюємо мапу з'єднань
      thread.connections.forEach(conn => {
        if (!connectionMap.has(conn.source)) {
          connectionMap.set(conn.source, []);
        }
        connectionMap.get(conn.source).push(conn);
      });
      
      // Шукаємо стартовий блок
      const startBlock = thread.blocks.find(block => block.type === 'start');
      if (!startBlock) {
        code += '            // Стартовий блок не знайдено\n';
      } else {
        // Генеруємо код зі стартового блоку
        let threadCode = '';
        threadCode = this.generateCSharpBlockCode(
          startBlock, 
          blockMap, 
          connectionMap, 
          '            ', 
          new Set(), 
          threadCode,
          false // Початково не в блоці lock
        );
        code += threadCode;
      }
      
      code += '        }\n\n';
    });
    
    code += '    }\n';
    code += '}\n';
    
    return code;
  }
  
  // Допоміжна функція для генерації C# коду для блоку та його наступників
  generateCSharpBlockCode(block, blockMap, connectionMap, indent, visited, codeAcc, isInsideLock = false) {
    // Перевіряємо чи ми вже відвідували цей блок, щоб уникнути безкінечних циклів
    if (visited.has(block.id)) {
      codeAcc += `${indent}// Перехід до блоку ${block.id} (вже оброблений)\n`;
      return codeAcc;
    }
    
    // Позначаємо як відвіданий
    visited.add(block.id);
    
    // Генеруємо код залежно від типу блоку
    switch (block.type) {
      case 'start':
        // Нічого особливого для стартового блоку
        break;
        
      case 'end':
        // Не додаємо return для кращого слідування блок-схемі
        break;
        
      case 'assignment':
        const assignProps = block.properties;
        
        if (assignProps.type === 'variable') {
          if (!isInsideLock) {
            codeAcc += `${indent}lock (_lock)\n`;
            codeAcc += `${indent}{\n`;
            codeAcc += `${indent}    ${assignProps.variable} = ${assignProps.source};\n`;
            codeAcc += `${indent}}\n`;
          } else {
            codeAcc += `${indent}${assignProps.variable} = ${assignProps.source};\n`;
          }
        } else {
          if (!isInsideLock) {
            codeAcc += `${indent}lock (_lock)\n`;
            codeAcc += `${indent}{\n`;
            codeAcc += `${indent}    ${assignProps.variable} = ${assignProps.value};\n`;
            codeAcc += `${indent}}\n`;
          } else {
            codeAcc += `${indent}${assignProps.variable} = ${assignProps.value};\n`;
          }
        }
        break;
        
      case 'input':
        const inputProps = block.properties;
        codeAcc += `${indent}Console.Write("Enter ${inputProps.variable}: ");\n`;
        codeAcc += `${indent}int.TryParse(Console.ReadLine(), out var tempInput);\n`;
        codeAcc += `${indent}${inputProps.variable} = tempInput;\n`;
        break;
        
      case 'output':
        const outputProps = block.properties;
        
        if (!isInsideLock) {
          codeAcc += `${indent}lock (_lock)\n`;
          codeAcc += `${indent}{\n`;
          codeAcc += `${indent}    Console.WriteLine(${outputProps.variable});\n`;
          codeAcc += `${indent}}\n`;
        } else {
          codeAcc += `${indent}Console.WriteLine(${outputProps.variable});\n`;
        }
        break;
        
      case 'decision':
        const decisionProps = block.properties;
        const comparisonOp = decisionProps.comparison === 'equal' ? '==' : '<';
        
        codeAcc += `${indent}lock (_lock)\n`;
        codeAcc += `${indent}{\n`;
        codeAcc += `${indent}    if (${decisionProps.variable} ${comparisonOp} ${decisionProps.value})\n`;
        codeAcc += `${indent}    {\n`;
        
        // Шукаємо з'єднання 'так' (зазвичай з Right)
        const yesConnections = connectionMap.get(block.id) || [];
        const yesConn = yesConnections.find(c => c.sourceEndpoint === 'Right');
        
        let yesBranchCode = '';
        
        if (yesConn && blockMap.has(yesConn.target)) {
          // Додаємо коментар для гілки "так"
          yesBranchCode += `${indent}        // Yes branch\n`;
          // Обробляємо гілку 'так' зі збільшеним відступом
          yesBranchCode = this.generateCSharpBlockCode(
            blockMap.get(yesConn.target),
            blockMap,
            connectionMap,
            indent + '        ',
            new Set(visited),
            yesBranchCode,
            true // В середині блоку lock
          );
        } else {
          yesBranchCode += `${indent}        // No action\n`;
        }
        
        codeAcc += yesBranchCode;
        codeAcc += `${indent}    }\n`;
        codeAcc += `${indent}    else\n`;
        codeAcc += `${indent}    {\n`;
        
        // Шукаємо з'єднання 'ні' (зазвичай з Bottom)
        const noConn = yesConnections.find(c => c.sourceEndpoint === 'Bottom');
        
        let noBranchCode = '';
        
        if (noConn && blockMap.has(noConn.target)) {
          // Додаємо коментар для гілки "ні"
          noBranchCode += `${indent}        // No branch\n`;
          // Обробляємо гілку 'ні' зі збільшеним відступом
          noBranchCode = this.generateCSharpBlockCode(
            blockMap.get(noConn.target),
            blockMap,
            connectionMap,
            indent + '        ',
            new Set(visited),
            noBranchCode,
            true // В середині блоку lock
          );
        } else {
          noBranchCode += `${indent}        // No action\n`;
        }
        
        codeAcc += noBranchCode;
        codeAcc += `${indent}    }\n`;
        codeAcc += `${indent}}\n`;
        
        // Для блок-схеми потрібно перейти до наступного блоку після decision
        const afterDecisionConnections = connectionMap.get(block.id) || [];
        const afterDecisionConn = afterDecisionConnections.find(c => 
          c.sourceEndpoint !== 'Right' && c.sourceEndpoint !== 'Bottom');
        
        if (afterDecisionConn && blockMap.has(afterDecisionConn.target)) {
          // Обробляємо наступний блок після decision
          const blockAfterDecision = blockMap.get(afterDecisionConn.target);
          if (!visited.has(blockAfterDecision.id)) {
            codeAcc = this.generateCSharpBlockCode(
              blockAfterDecision,
              blockMap,
              connectionMap,
              indent,
              visited,
              codeAcc
            );
          }
        }
        
        return codeAcc;
    }
    
    // Шукаємо наступні блоки для обробки (для не-decision блоків)
    const nextConnections = connectionMap.get(block.id) || [];
    
    if (nextConnections.length > 0) {
      // Отримуємо перше з'єднання (в послідовності)
      const nextConn = nextConnections[0];
      
      if (nextConn && blockMap.has(nextConn.target)) {
        // Обробляємо наступний блок
        codeAcc = this.generateCSharpBlockCode(
          blockMap.get(nextConn.target),
          blockMap,
          connectionMap,
          indent,
          visited,
          codeAcc,
          isInsideLock
        );
      }
    }
    
    return codeAcc;
  }
  
  // Генерація Java коду
  generateJavaCode(data) {
    // Реалізація для генерації Java коду
    return '// Java код генерації ще не повністю реалізований';
  }
  
  // Отримання розширення файлу
  getFileExtension(language) {
    const extensions = {
      'python': 'py',
      'c': 'c',
      'cpp': 'cpp',
      'csharp': 'cs',
      'java': 'java'
    };
    
    return extensions[language] || 'txt';
  }
}

module.exports = new CodeGeneratorService(); 