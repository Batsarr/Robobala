// ========================================================================
// AUTO-TUNING ALGORITHMS - CLIENT-SIDE IMPLEMENTATION
// ========================================================================

// Global tuning session management
let fitnessChart = null;
let fitnessChartData = [];

// Baseline PID parameters - stored before tuning session starts
// Used to restore robot to safe state during pause or after emergency stop
let baselinePID = {
    kp: 0,
    ki: 0,
    kd: 0
};

// ========================================================================
// HELPER FUNCTIONS
// ========================================================================

/**
 * Show notification to user (fallback to console if not defined elsewhere)
 */
function showNotification(message) {
    // Try to use addLogMessage if available
    if (typeof addLogMessage === 'function') {
        addLogMessage(`[Tuning] ${message}`, 'info');
    } else {
        console.log(`[Notification] ${message}`);
    }
}

function mean(arr) {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// NOTE: a delay helper (const delay = ms => ...) is already defined earlier in the file;
// the duplicate function declaration was removed to avoid "Declaration or statement expected" / duplicate identifier errors.

function updateBestDisplay(params) {
    document.getElementById('best-kp').textContent = params.kp.toFixed(3);
    document.getElementById('best-ki').textContent = params.ki.toFixed(3);
    document.getElementById('best-kd').textContent = params.kd.toFixed(3);
    if (params.fitness !== undefined && params.fitness !== Infinity) {
        document.getElementById('best-fitness').textContent = params.fitness.toFixed(4);
    }
    document.getElementById('apply-best-btn').disabled = false;
}

function updateProgressDisplay(current, total, bestFitness) {
    document.getElementById('current-iteration').textContent = current;
    document.getElementById('total-iterations').textContent = total;
    if (bestFitness !== undefined && bestFitness !== Infinity) {
        document.getElementById('best-fitness').textContent = bestFitness.toFixed(4);
    }
    
    // Update chart
    fitnessChartData.push({x: current, y: bestFitness});
    updateFitnessChart();
}

function updateFitnessChart() {
    const canvas = document.getElementById('fitness-chart');
    if (!canvas) return; // Defensive check
    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (fitnessChartData.length === 0) return;
    
    // Find min/max for scaling
    const validFitnessData = fitnessChartData.filter(d => d.y !== Infinity && d.y !== undefined);
    if (validFitnessData.length === 0) return;

    const minFitness = Math.min(...validFitnessData.map(d => d.y));
    const maxFitness = Math.max(...validFitnessData.map(d => d.y));
    const maxIteration = Math.max(...fitnessChartData.map(d => d.x));
    
    const padding = 40;
    const width = canvas.width - 2 * padding;
    const height = canvas.height - 2 * padding;
    
    // Draw axes
    ctx.strokeStyle = '#61dafb';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, canvas.height - padding);
    ctx.lineTo(canvas.width - padding, canvas.height - padding);
    ctx.stroke();
    
    // Draw labels
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px Arial';
    ctx.fillText('Fitness', 5, padding);
    ctx.fillText('Iteracja', canvas.width - padding, canvas.height - padding + 20);
    
    // Draw data
    ctx.strokeStyle = '#a2f279';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    validFitnessData.forEach((point, i) => {
        const x = padding + (point.x / maxIteration) * width;
        const yRange = (maxFitness - minFitness) > 0 ? (maxFitness - minFitness) : 1;
        const y = canvas.height - padding - ((point.y - minFitness) / yRange) * height;
        
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.stroke();
    
    // Draw points
    ctx.fillStyle = '#a2f279';
    validFitnessData.forEach(point => {
        const x = padding + (point.x / maxIteration) * width;
        const yRange = (maxFitness - minFitness) > 0 ? (maxFitness - minFitness) : 1;
        const y = canvas.height - padding - ((point.y - minFitness) / yRange) * height;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, 2 * Math.PI);
        ctx.fill();
    });
}

function addTestToResultsTable(testNum, params, fitness, itae, overshoot) {
    const tbody = document.getElementById('results-table-body');
    // Zapis do historii globalnej
    try {
        if (Array.isArray(tuningHistory)) {
            tuningHistory.push({ idx: testNum, kp: params.kp, ki: params.ki, kd: params.kd, fitness, itae, overshoot });
            refreshRecentList();
        }
    } catch(_) {}
    if (!tbody) return; // Defensive check
    const row = tbody.insertRow(0); // Insert at top
    
    row.innerHTML = `
        <td>${testNum}</td>
        <td>${params.kp.toFixed(3)}</td>
        <td>${params.ki.toFixed(3)}</td>
        <td>${params.kd.toFixed(3)}</td>
        <td>${fitness.toFixed(4)}</td>
        <td>${(itae || 0).toFixed(2)}</td>
        <td>${(overshoot || 0).toFixed(2)}%</td>
        <td><button onclick="applyParameters(${params.kp}, ${params.ki}, ${params.kd})" class="btn-small">Zastosuj</button></td>
    `;
    
    // Tabela jest widoczna w modalu historii – brak odwołania do nieistniejącego #results-container
}

function applyParameters(kp, ki, kd) {
    const loop = document.getElementById('tuning-loop-selector').value;
    let kpKey = 'kp_b', kiKey = 'ki_b', kdKey = 'kd_b';
    if (loop === 'speed') { kpKey = 'kp_s'; kiKey = 'ki_s'; kdKey = 'kd_s'; }
    else if (loop === 'position') { kpKey = 'kp_p'; kiKey = 'ki_p'; kdKey = 'kd_p'; }
    
    // Send parameters to robot
    if(typeof sendBleCommand === 'function') {
        sendBleCommand('set_param', {key: kpKey, value: kp});
        sendBleCommand('set_param', {key: kiKey, value: ki});
        sendBleCommand('set_param', {key: kdKey, value: kd});
    } else { // Fallback
        sendBleMessage({ type: 'set_param', key: kpKey, value: kp});
        sendBleMessage({ type: 'set_param', key: kiKey, value: ki});
        sendBleMessage({ type: 'set_param', key: kdKey, value: kd});
    }
    
    showNotification(`Zastosowano parametry: Kp=${kp.toFixed(3)}, Ki=${ki.toFixed(3)}, Kd=${kd.toFixed(3)}`);
}

/**
 * Send baseline PID parameters to robot
 * Called when pausing tuning to restore safe balancing state
 */
function sendBaselinePIDToRobot() {
    const loop = document.getElementById('tuning-loop-selector')?.value || 'balance';
    let kpKey = 'kp_b', kiKey = 'ki_b', kdKey = 'kd_b';
    if (loop === 'speed') { kpKey = 'kp_s'; kiKey = 'ki_s'; kdKey = 'kd_s'; }
    else if (loop === 'position') { kpKey = 'kp_p'; kiKey = 'ki_p'; kdKey = 'kd_p'; }
    
    // Send baseline parameters to robot
    if(typeof sendBleCommand === 'function') {
        sendBleCommand('set_param', {key: kpKey, value: baselinePID.kp});
        sendBleCommand('set_param', {key: kiKey, value: baselinePID.ki});
        sendBleCommand('set_param', {key: kdKey, value: baselinePID.kd});
    }
    
    console.log(`[Tuning] Restored baseline PID: Kp=${baselinePID.kp.toFixed(3)}, Ki=${baselinePID.ki.toFixed(3)}, Kd=${baselinePID.kd.toFixed(3)}`);
}

/**
 * Capture current PID parameters as baseline
 * Called at the start of tuning session
 */
function captureBaselinePID() {
    const loop = document.getElementById('tuning-loop-selector')?.value || 'balance';
    
    // Map loop type to input element IDs
    let kpInputId, kiInputId, kdInputId;
    if (loop === 'balance') {
        kpInputId = 'balanceKpInput';
        kiInputId = 'balanceKiInput';
        kdInputId = 'balanceKdInput';
    } else if (loop === 'speed') {
        kpInputId = 'speedKpInput';
        kiInputId = 'speedKiInput';
        kdInputId = 'speedKdInput';
    } else if (loop === 'position') {
        kpInputId = 'positionKpInput';
        kiInputId = 'positionKiInput';
        kdInputId = 'positionKdInput';
    }
    
    // Read current values from UI
    const kpElement = document.getElementById(kpInputId);
    const kiElement = document.getElementById(kiInputId);
    const kdElement = document.getElementById(kdInputId);
    
    if (kpElement && kiElement && kdElement) {
        baselinePID.kp = parseFloat(kpElement.value) || 0;
        baselinePID.ki = parseFloat(kiElement.value) || 0;
        baselinePID.kd = parseFloat(kdElement.value) || 0;
        
        console.log(`[Tuning] Captured baseline PID: Kp=${baselinePID.kp.toFixed(3)}, Ki=${baselinePID.ki.toFixed(3)}, Kd=${baselinePID.kd.toFixed(3)}`);
    } else {
        console.warn('[Tuning] Could not capture baseline PID - input elements not found');
    }
}

// ========================================================================
// GENETIC ALGORITHM
// ========================================================================

class GeneticAlgorithm {
    constructor(config) {
        this.populationSize = config.populationSize || 20;
        this.generations = config.generations || 30;
        this.mutationRate = config.mutationRate || 0.1;
        this.crossoverRate = config.crossoverRate || 0.7;
        this.elitism = config.elitism !== false;
        this.searchSpace = config.searchSpace;
        
        this.population = [];
        this.generation = 0;
        this.bestIndividual = null;
        this.isRunning = false;
        this.isPaused = false;
        this.testCounter = 0;
    }
    
    initialize() {
        this.population = [];
        for (let i = 0; i < this.populationSize; i++) {
            this.population.push(this.createRandomIndividual());
        }
        this.generation = 0;
        this.testCounter = 0;
        fitnessChartData = [];
        this.bestIndividual = null;
    }
    
    createRandomIndividual() {
        return {
            kp: Math.random() * (this.searchSpace.kp_max - this.searchSpace.kp_min) + this.searchSpace.kp_min,
            ki: Math.random() * (this.searchSpace.ki_max - this.searchSpace.ki_min) + this.searchSpace.ki_min,
            kd: Math.random() * (this.searchSpace.kd_max - this.searchSpace.kd_min) + this.searchSpace.kd_min,
            fitness: Infinity
        };
    }
    
    async evaluateFitness(individual) {
        const testId = Date.now();
        this.testCounter++;
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                window.removeEventListener('ble_message', completeHandler); // Clean up on timeout
                window.removeEventListener('ble_message', metricsHandler);
                reject(new Error('Test timeout'));
            }, 10000); // 10 second timeout
            
            const metricsHandler = (event) => {
                const data = event.detail; // Get data from CustomEvent
                if ((data.type === 'metrics_result' || data.type === 'test_result') && data.testId === testId) {
                    clearTimeout(timeout);
                    const fitness = (data.itae || 9999) + (data.overshoot || 0) * 10 + (data.steady_state_error || 0) * 5;
                    individual.fitness = fitness;
                    
                    addTestToResultsTable(this.testCounter, individual, fitness, data.itae, data.overshoot);
                    
                    // Remove handlers
                    window.removeEventListener('ble_message', completeHandler);
                    window.removeEventListener('ble_message', metricsHandler);
                    resolve(fitness);
                }
            };
            
            const completeHandler = (event) => {
                const data = event.detail;
                if (data.type === 'test_complete' && data.testId === testId) {
                    if (!data.success) {
                        clearTimeout(timeout);
                        window.removeEventListener('ble_message', completeHandler);
                        window.removeEventListener('ble_message', metricsHandler);
                        reject({ reason: 'interrupted_by_emergency', testId: testId });
                    }
                }
            };
            
            window.addEventListener('ble_message', metricsHandler);
            window.addEventListener('ble_message', completeHandler);
            
            sendBleCommand('run_metrics_test', {
                kp: individual.kp,
                ki: individual.ki,
                kd: individual.kd,
                testId: testId
            });
        });
    }
    
    async runGeneration() {
        // Evaluate all individuals
        for (let i = 0; i < this.population.length; i++) {
            if (this.isPaused) {
                await delay(100);
                i--; // Repeat this iteration
                continue;
            }
            
            if (!this.isRunning) break;
            
            if (this.population[i].fitness === Infinity) {
                try {
                    await this.evaluateFitness(this.population[i]);
                } catch (error) {
                    console.error('Test failed:', error);
                    
                    // Handle emergency stop - pause and wait for user to resume
                    if (error.reason === 'interrupted_by_emergency') {
                        console.log('[GA] Emergency stop detected, entering pause state');
                        this.isPaused = true;
                        sendBaselinePIDToRobot();
                        
                        // Wait for resume
                        while (this.isPaused && this.isRunning) {
                            await delay(100);
                        }
                        
                        // Retry the same test after resume
                        if (this.isRunning) {
                            console.log('[GA] Retrying interrupted test after resume');
                            i--; // Retry this individual
                            continue;
                        }
                    } else {
                        // Other errors - mark as failed
                        this.population[i].fitness = Infinity;
                    }
                }
            }
        }
        
        // Sort by fitness
        this.population.sort((a, b) => a.fitness - b.fitness);
        
        // Update best
        if (!this.bestIndividual || this.population[0].fitness < this.bestIndividual.fitness) {
            this.bestIndividual = {...this.population[0]};
            updateBestDisplay(this.bestIndividual);
        }
        
        // Create new population
        const newPopulation = [];
        
        // Elitism
        if (this.elitism && this.population[0].fitness !== Infinity) {
            newPopulation.push({...this.population[0]});
        }
        
        // Selection, crossover, mutation
        while (newPopulation.length < this.populationSize) {
            const parent1 = this.tournamentSelection();
            const parent2 = this.tournamentSelection();
            
            let offspring;
            if (Math.random() < this.crossoverRate && parent1 && parent2) {
                offspring = this.crossover(parent1, parent2);
            } else {
                offspring = {...(parent1 || this.createRandomIndividual())};
            }
            
            offspring = this.mutate(offspring);
            offspring.fitness = Infinity;
            newPopulation.push(offspring);
        }
        
        this.population = newPopulation;
        this.generation++;
        
        updateProgressDisplay(this.generation, this.generations, this.bestIndividual ? this.bestIndividual.fitness : Infinity);
    }
    
    tournamentSelection() {
        const tournamentSize = 3;
        let best = null;
        const validPopulation = this.population.filter(p => p.fitness !== Infinity);
        if (validPopulation.length === 0) return null;

        for (let i = 0; i < tournamentSize; i++) {
            const candidate = validPopulation[Math.floor(Math.random() * validPopulation.length)];
            if (!best || candidate.fitness < best.fitness) {
                best = candidate;
            }
        }
        
        return best;
    }
    
    crossover(parent1, parent2) {
        const alpha = Math.random();
        return {
            kp: alpha * parent1.kp + (1 - alpha) * parent2.kp,
            ki: alpha * parent1.ki + (1 - alpha) * parent2.ki,
            kd: alpha * parent1.kd + (1 - alpha) * parent2.kd,
            fitness: Infinity
        };
    }
    
    mutate(individual) {
        const mutated = {...individual};
        
        if (Math.random() < this.mutationRate) {
            mutated.kp += (Math.random() - 0.5) * (this.searchSpace.kp_max - this.searchSpace.kp_min) * 0.1;
            mutated.kp = Math.max(this.searchSpace.kp_min, Math.min(this.searchSpace.kp_max, mutated.kp));
        }
        
        if (Math.random() < this.mutationRate) {
            mutated.ki += (Math.random() - 0.5) * (this.searchSpace.ki_max - this.searchSpace.ki_min) * 0.1;
            mutated.ki = Math.max(this.searchSpace.ki_min, Math.min(this.searchSpace.ki_max, mutated.ki));
        }
        
        if (Math.random() < this.mutationRate) {
            mutated.kd += (Math.random() - 0.5) * (this.searchSpace.kd_max - this.searchSpace.kd_min) * 0.1;
            mutated.kd = Math.max(this.searchSpace.kd_min, Math.min(this.searchSpace.kd_max, mutated.kd));
        }
        
        return mutated;
    }
    
    async run() {
        this.isRunning = true;
        this.initialize();
        
        const progressEl = document.getElementById('tuning-progress-panel');
        if (progressEl) progressEl.style.display = 'block';
        
        while (this.generation < this.generations && this.isRunning) {
            if (!this.isPaused) {
                await this.runGeneration();
            } else {
                await delay(100);
            }
        }
        
        this.isRunning = false;
        
        // POPRAWKA: Dodano sprawdzenie, czy this.bestIndividual nie jest null.
        if (this.bestIndividual) {
            showNotification(`Optymalizacja GA zakończona! Najlepsze fitness: ${this.bestIndividual.fitness.toFixed(4)}`);
        } else {
            showNotification('Optymalizacja GA zakończona - nie znaleziono żadnego rozwiązania.');
        }
    }
    
    pause() { 
        this.isPaused = true;
        // Restore baseline PID to robot when pausing
        // This happens after current test completes (see runGeneration loop)
        setTimeout(() => {
            if (this.isPaused) {
                sendBaselinePIDToRobot();
            }
        }, 100);
    }
    
    resume() { 
        this.isPaused = false; 
    }
    
    stop() { 
        this.isRunning = false;
        // Restore baseline PID when stopping
        sendBaselinePIDToRobot();
    }
}

// ========================================================================
// PSO ALGORITHM
// ========================================================================

class ParticleSwarmOptimization {
    constructor(config) {
        this.numParticles = config.numParticles || 20;
        this.iterations = config.iterations || 30;
        this.inertiaWeight = config.inertiaWeight || 0.7;
        this.cognitiveWeight = config.cognitiveWeight || 1.5;
        this.socialWeight = config.socialWeight || 1.5;
        this.searchSpace = config.searchSpace;
        
        this.particles = [];
        this.globalBest = null;
        this.iteration = 0;
        this.isRunning = false;
        this.isPaused = false;
        this.testCounter = 0;
    }
    
    initialize() {
        this.particles = [];
        for (let i = 0; i < this.numParticles; i++) {
            this.particles.push(this.createRandomParticle());
        }
        this.globalBest = null;
        this.iteration = 0;
        this.testCounter = 0;
        fitnessChartData = [];
    }
    
    createRandomParticle() {
        const position = {
            kp: Math.random() * (this.searchSpace.kp_max - this.searchSpace.kp_min) + this.searchSpace.kp_min,
            ki: Math.random() * (this.searchSpace.ki_max - this.searchSpace.ki_min) + this.searchSpace.ki_min,
            kd: Math.random() * (this.searchSpace.kd_max - this.searchSpace.kd_min) + this.searchSpace.kd_min
        };
        
        return {
            position: position,
            velocity: {kp: 0, ki: 0, kd: 0},
            bestPosition: {...position},
            bestFitness: Infinity,
            fitness: Infinity
        };
    }
    
    async evaluateFitness(particle) {
        const testId = Date.now();
        this.testCounter++;
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                window.removeEventListener('ble_message', completeHandler);
                window.removeEventListener('ble_message', metricsHandler);
                reject(new Error('Test timeout'));
            }, 10000);
            
            const metricsHandler = (event) => {
                const data = event.detail;
                if ((data.type === 'metrics_result' || data.type === 'test_result') && data.testId === testId) {
                    clearTimeout(timeout);
                    const fitness = (data.itae || 9999) + (data.overshoot || 0) * 10 + (data.steady_state_error || 0) * 5;
                    particle.fitness = fitness;
                    
                    if (fitness < particle.bestFitness) {
                        particle.bestFitness = fitness;
                        particle.bestPosition = {...particle.position};
                    }
                    
                    if (!this.globalBest || fitness < this.globalBest.fitness) {
                        this.globalBest = {
                            position: {...particle.position},
                            fitness: fitness
                        };
                        updateBestDisplay(this.globalBest.position);
                    }
                    
                    addTestToResultsTable(this.testCounter, particle.position, fitness, data.itae, data.overshoot);
                    
                    window.removeEventListener('ble_message', completeHandler);
                    window.removeEventListener('ble_message', metricsHandler);
                    resolve(fitness);
                }
            };

            const completeHandler = (event) => {
                const data = event.detail;
                if (data.type === 'test_complete' && data.testId === testId) {
                    if (!data.success) {
                        clearTimeout(timeout);
                        window.removeEventListener('ble_message', completeHandler);
                        window.removeEventListener('ble_message', metricsHandler);
                        reject({ reason: 'interrupted_by_emergency', testId: testId });
                    }
                }
            };
            
            window.addEventListener('ble_message', metricsHandler);
            window.addEventListener('ble_message', completeHandler);
            
            sendBleCommand('run_metrics_test', {
                kp: particle.position.kp,
                ki: particle.position.ki,
                kd: particle.position.kd,
                testId: testId
            });
        });
    }
    
    async runIteration() {
        // Evaluate all particles
        for (let i = 0; i < this.particles.length; i++) {
            if (this.isPaused) {
                await delay(100);
                i--;
                continue;
            }
            
            if (!this.isRunning) break;
            
            try {
                await this.evaluateFitness(this.particles[i]);
            } catch (error) {
                console.error('Test failed:', error);
                
                // Handle emergency stop - pause and wait for user to resume
                if (error.reason === 'interrupted_by_emergency') {
                    console.log('[PSO] Emergency stop detected, entering pause state');
                    this.isPaused = true;
                    sendBaselinePIDToRobot();
                    
                    // Wait for resume
                    while (this.isPaused && this.isRunning) {
                        await delay(100);
                    }
                    
                    // Retry the same test after resume
                    if (this.isRunning) {
                        console.log('[PSO] Retrying interrupted test after resume');
                        i--; // Retry this particle
                        continue;
                    }
                } else {
                    // Other errors - mark as failed
                    this.particles[i].fitness = Infinity;
                }
            }
        }
        
        // Update velocities and positions
        for (let particle of this.particles) {
            this.updateVelocity(particle);
            this.updatePosition(particle);
        }
        
        this.iteration++;
        updateProgressDisplay(this.iteration, this.iterations, this.globalBest ? this.globalBest.fitness : Infinity);
    }
    
    updateVelocity(particle) {
        if (!this.globalBest) return; // Don't update if no global best yet
        const r1 = Math.random();
        const r2 = Math.random();
        
        for (let dim of ['kp', 'ki', 'kd']) {
            const cognitive = this.cognitiveWeight * r1 * (particle.bestPosition[dim] - particle.position[dim]);
            const social = this.socialWeight * r2 * (this.globalBest.position[dim] - particle.position[dim]);
            particle.velocity[dim] = this.inertiaWeight * particle.velocity[dim] + cognitive + social;
            
            // Velocity clamping
            const maxVel = (this.searchSpace[dim + '_max'] - this.searchSpace[dim + '_min']) * 0.2;
            particle.velocity[dim] = Math.max(-maxVel, Math.min(maxVel, particle.velocity[dim]));
        }
    }
    
    updatePosition(particle) {
        for (let dim of ['kp', 'ki', 'kd']) {
            particle.position[dim] += particle.velocity[dim];
            // Clamp to search space
            particle.position[dim] = Math.max(this.searchSpace[dim + '_min'], 
                                             Math.min(this.searchSpace[dim + '_max'], 
                                                     particle.position[dim]));
        }
    }
    
    async run() {
        this.isRunning = true;
        this.initialize();
        
        const progressEl = document.getElementById('tuning-progress-panel');
        if (progressEl) progressEl.style.display = 'block';
        
        while (this.iteration < this.iterations && this.isRunning) {
            if (!this.isPaused) {
                await this.runIteration();
            } else {
                await delay(100);
            }
        }
        
        this.isRunning = false;
        
        // POPRAWKA: Dodano sprawdzenie, czy this.globalBest nie jest null.
        if (this.globalBest) {
            showNotification(`Optymalizacja PSO zakończona! Najlepsze fitness: ${this.globalBest.fitness.toFixed(4)}`);
        } else {
            showNotification('Optymalizacja PSO zakończona - nie znaleziono żadnego rozwiązania.');
        }
    }
    
    pause() { 
        this.isPaused = true;
        // Restore baseline PID to robot when pausing
        setTimeout(() => {
            if (this.isPaused) {
                sendBaselinePIDToRobot();
            }
        }, 100);
    }
    
    resume() { 
        this.isPaused = false; 
    }
    
    stop() { 
        this.isRunning = false;
        // Restore baseline PID when stopping
        sendBaselinePIDToRobot();
    }
}

// ========================================================================
// ZIEGLER-NICHOLS RELAY METHOD
// ========================================================================

class ZieglerNicholsRelay {
    constructor(config) {
        this.amplitude = config.amplitude || 2.0;
        this.minCycles = config.minCycles || 3;
        this.isRunning = false;
        
        this.oscillationData = [];
        this.peaks = [];
        this.valleys = [];
    }
    
    async run() {
        this.isRunning = true;
        const testId = Date.now();
        
        this.oscillationData = [];
        this.peaks = [];
        this.valleys = [];
        
        const displayEl = document.getElementById('zn-oscillation-display');
        if (displayEl) displayEl.style.display = 'block';
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                window.removeEventListener('ble_message', handler);
                reject(new Error('ZN test timeout'));
            }, 30000); // 30 second timeout
            
            const handler = (event) => {
                const data = event.detail;
                if (data.type === 'relay_state' && data.testId === testId) {
                    this.oscillationData.push({
                        time: data.time,
                        angle: data.angle,
                        relayOutput: data.relay_output
                    });
                    
                    this.detectPeaksValleys();
                    this.updateRelayChart();
                    
                    const cyclesEl = document.getElementById('zn-detected-cycles');
                    if(cyclesEl) cyclesEl.textContent = Math.min(this.peaks.length, this.valleys.length);
                    
                    // Check if we have enough cycles
                    if (this.peaks.length >= this.minCycles && this.valleys.length >= this.minCycles) {
                        clearTimeout(timeout);
                        window.removeEventListener('ble_message', handler);
                        
                        const results = this.calculateZNParameters();
                        this.displayResults(results);
                        resolve(results);
                    }
                } else if (data.type === 'test_complete' && data.testId === testId) {
                    clearTimeout(timeout);
                    window.removeEventListener('ble_message', handler);
                    
                    if (this.peaks.length >= this.minCycles && this.valleys.length >= this.minCycles) {
                        const results = this.calculateZNParameters();
                        this.displayResults(results);
                        resolve(results);
                    } else {
                        reject(new Error('Not enough oscillation cycles detected'));
                    }
                }
            };
            
            window.addEventListener('ble_message', handler);
            
            sendBleCommand('run_relay_test', {
                amplitude: this.amplitude,
                testId: testId
            });
        });
    }
    
    detectPeaksValleys() {
        const data = this.oscillationData;
        const n = data.length;
        if (n < 3) return;
        
        const last = data[n-1];
        const prev = data[n-2];
        const prevPrev = data[n-3];
        
        // Peak detected
        if (prev.angle > prevPrev.angle && prev.angle > last.angle) {
            if (this.peaks.length === 0 || prev.time - this.peaks[this.peaks.length - 1].time > 0.1) {
                this.peaks.push({time: prev.time, value: prev.angle});
            }
        }
        
        // Valley detected
        if (prev.angle < prevPrev.angle && prev.angle < last.angle) {
            if (this.valleys.length === 0 || prev.time - this.valleys[this.valleys.length - 1].time > 0.1) {
                this.valleys.push({time: prev.time, value: prev.angle});
            }
        }
    }
    
    calculateZNParameters() {
        const peakValues = this.peaks.slice(-this.minCycles).map(p => p.value);
        const valleyValues = this.valleys.slice(-this.minCycles).map(v => v.value);
        
        const avgAmplitude = (mean(peakValues) - mean(valleyValues)) / 2;
        const ku = (4 * this.amplitude) / (Math.PI * avgAmplitude);
        
        // Calculate period
        const periods = [];
        for (let i = 1; i < this.peaks.length; i++) {
            periods.push(this.peaks[i].time - this.peaks[i-1].time);
        }
        const tu = mean(periods);
        
        // Apply Z-N tuning rules
        return {
            ku: ku,
            tu: tu,
            kp: 0.6 * ku,
            ki: 1.2 * ku / tu,
            kd: 0.075 * ku * tu
        };
    }
    
    displayResults(results) {
        updateBestDisplay({kp: results.kp, ki: results.ki, kd: results.kd, fitness: 0});
        showNotification(`ZN: Ku=${results.ku.toFixed(3)}, Tu=${results.tu.toFixed(3)}s`);
    }
    
    updateRelayChart() {
        const canvas = document.getElementById('zn-oscillation-chart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (this.oscillationData.length === 0) return;
        
        const times = this.oscillationData.map(d => d.time);
        const angles = this.oscillationData.map(d => d.angle);
        
        const minTime = Math.min(...times);
        const maxTime = Math.max(...times);
        const minAngle = Math.min(...angles);
        const maxAngle = Math.max(...angles);
        
        const padding = 30;
        const width = canvas.width - 2 * padding;
        const height = canvas.height - 2 * padding;
        
        // Draw axes
        ctx.strokeStyle = '#61dafb';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, canvas.height - padding);
        ctx.lineTo(canvas.width - padding, canvas.height - padding);
        ctx.stroke();
        
        // Draw oscillation
        ctx.strokeStyle = '#a2f279';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        this.oscillationData.forEach((point, i) => {
            const x = padding + ((point.time - minTime) / (maxTime - minTime + 0.001)) * width;
            const y = canvas.height - padding - ((point.angle - minAngle) / (maxAngle - minAngle + 0.001)) * height;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();
        
        // Mark peaks and valleys
        ctx.fillStyle = '#ff6b6b';
        this.peaks.forEach(peak => {
            const x = padding + ((peak.time - minTime) / (maxTime - minTime + 0.001)) * width;
            const y = canvas.height - padding - ((peak.value - minAngle) / (maxAngle - minAngle + 0.001)) * height;
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, 2 * Math.PI);
            ctx.fill();
        });
        
        ctx.fillStyle = '#4ecdc4';
        this.valleys.forEach(valley => {
            const x = padding + ((valley.time - minTime) / (maxTime - minTime + 0.001)) * width;
            const y = canvas.height - padding - ((valley.value - minAngle) / (maxAngle - minAngle + 0.001)) * height;
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, 2 * Math.PI);
            ctx.fill();
        });
    }
    
    stop() {
        this.isRunning = false;
        sendBleCommand('cancel_test', {});
        // Restore baseline PID when stopping
        sendBaselinePIDToRobot();
    }
}


// ========================================================================
// BAYESIAN OPTIMIZATION
// ========================================================================

class BayesianOptimization {
    constructor(config) {
        this.iterations = config.iterations || 25;
        this.initialSamples = config.initialSamples || 5;
        this.searchSpace = config.searchSpace;
        this.acquisitionFunction = config.acquisitionFunction || 'ei'; // ei, ucb, pi
        this.xi = config.xi || 0.01; // exploration parameter
        
        this.samples = [];
        this.iteration = 0;
        this.isRunning = false;
        this.neuralNetwork = null;
        this.testCounter = 0;
    }
    
    async initialize() {
        this.samples = [];
        this.iteration = 0;
        this.testCounter = 0;
        fitnessChartData = [];
        
        // Collect initial random samples
        for (let i = 0; i < this.initialSamples; i++) {
            const sample = this.sampleRandom();
            try {
                const fitness = await this.evaluateSample(sample);
                this.samples.push({...sample, fitness});
            } catch (error) {
                console.error('Initial sample failed:', error);
                this.samples.push({...sample, fitness: Infinity});
            }
        }
        
        // Train initial surrogate model
        await this.trainSurrogate();
        
        // Show visualization
        const vizEl = document.getElementById('bayesian-visualization');
        if (vizEl) vizEl.style.display = 'block';
        this.updateVisualization();
    }
    
    async trainSurrogate() {
        // Use ml5.js neural network as surrogate for Gaussian Process
        if (typeof ml5 === 'undefined') {
            console.error('ml5.js is not loaded. Bayesian Optimization cannot work.');
            return;
        }
        
        if (!this.neuralNetwork) {
            this.neuralNetwork = ml5.neuralNetwork({
                inputs: 3,
                outputs: 1,
                task: 'regression',
                layers: [
                    { type: 'dense', units: 32, activation: 'relu' },
                    { type: 'dense', units: 16, activation: 'relu' }
                ]
            });
        }
        
        // Clear previous data
        this.neuralNetwork.data.data.raw = [];
        
        // Add training data (filter out failed samples)
        const validSamples = this.samples.filter(s => s.fitness !== Infinity);
        validSamples.forEach(sample => {
            this.neuralNetwork.addData(
                {kp: sample.kp, ki: sample.ki, kd: sample.kd},
                {fitness: sample.fitness}
            );
        });
        
        if (validSamples.length < 2) {
            console.warn('Not enough valid samples to train surrogate');
            return;
        }
        
        await this.neuralNetwork.normalizeData();
        
        // Train with fewer epochs for faster iteration
        const trainingOptions = {
            epochs: 30,
            batchSize: Math.min(8, validSamples.length),
            validationSplit: 0.1
        };
        
        await this.neuralNetwork.train(trainingOptions);
    }
    
    async acquireNext() {
        if (!this.neuralNetwork || !this.neuralNetwork.isTrained) {
            return this.sampleRandom(); // Fallback if model not ready
        }
        let bestAcquisition = -Infinity;
        let bestSample = null;
        
        // Grid search over search space (coarse grid for speed)
        const gridSize = 8; // 8^3 = 512 points
        
        for (let i = 0; i < gridSize; i++) {
            for (let j = 0; j < gridSize; j++) {
                for (let k = 0; k < gridSize; k++) {
                    const kp = this.searchSpace.kp_min + (i / (gridSize - 1)) * (this.searchSpace.kp_max - this.searchSpace.kp_min);
                    const ki = this.searchSpace.ki_min + (j / (gridSize - 1)) * (this.searchSpace.ki_max - this.searchSpace.ki_min);
                    const kd = this.searchSpace.kd_min + (k / (gridSize - 1)) * (this.searchSpace.kd_max - this.searchSpace.kd_min);
                    
                    const acquisition = await this.calculateAcquisition({kp, ki, kd});
                    if (acquisition > bestAcquisition) {
                        bestAcquisition = acquisition;
                        bestSample = {kp, ki, kd};
                    }
                }
            }
        }
        
        return bestSample;
    }
    
    async calculateAcquisition(sample) {
        // Predict mean using neural network
        const prediction = await this.neuralNetwork.predict({kp: sample.kp, ki: sample.ki, kd: sample.kd});
        const predictedFitness = prediction[0].value; // ml5 uses .value
        
        // Find current best
        const validSamples = this.samples.filter(s => s.fitness !== Infinity);
        if (validSamples.length === 0) return 0;
        
        const currentBest = Math.min(...validSamples.map(s => s.fitness));
        
        // Calculate acquisition based on selected function
        if (this.acquisitionFunction === 'ei') {
            // Expected Improvement (simplified without proper GP uncertainty)
            const improvement = currentBest - predictedFitness;
            return Math.max(0, improvement + this.xi);
        } else if (this.acquisitionFunction === 'ucb') {
            // Upper Confidence Bound (simplified)
            // In real GP, we'd have proper uncertainty estimates
            const uncertainty = 1.0; // Placeholder - would come from GP
            return -predictedFitness + 2.0 * uncertainty;
        } else if (this.acquisitionFunction === 'pi') {
            // Probability of Improvement (simplified)
            const improvement = currentBest - predictedFitness;
            return improvement > 0 ? 1 : 0;
        }
        
        return -predictedFitness;
    }
    
    async evaluateSample(sample) {
        const testId = Date.now();
        this.testCounter++;
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                window.removeEventListener('ble_message', completeHandler);
                window.removeEventListener('ble_message', metricsHandler);
                reject(new Error('Test timeout'));
            }, 10000);
            
            const metricsHandler = (event) => {
                const data = event.detail;
                if ((data.type === 'metrics_result' || data.type === 'test_result') && data.testId === testId) {
                    clearTimeout(timeout);
                    const fitness = (data.itae || 9999) + (data.overshoot || 0) * 10 + (data.steady_state_error || 0) * 5;
                    
                    addTestToResultsTable(this.testCounter, sample, fitness, data.itae, data.overshoot);
                    
                    window.removeEventListener('ble_message', completeHandler);
                    window.removeEventListener('ble_message', metricsHandler);
                    resolve(fitness);
                }
            };

            const completeHandler = (event) => {
                const data = event.detail;
                if (data.type === 'test_complete' && data.testId === testId) {
                    if (!data.success) {
                        clearTimeout(timeout);
                        window.removeEventListener('ble_message', completeHandler);
                        window.removeEventListener('ble_message', metricsHandler);
                        reject({ reason: 'interrupted_by_emergency', testId: testId });
                    }
                }
            };
            
            window.addEventListener('ble_message', metricsHandler);
            window.addEventListener('ble_message', completeHandler);
            
            sendBleCommand('run_metrics_test', {
                kp: sample.kp,
                ki: sample.ki,
                kd: sample.kd,
                testId: testId
            });
        });
    }
    
    sampleRandom() {
        return {
            kp: Math.random() * (this.searchSpace.kp_max - this.searchSpace.kp_min) + this.searchSpace.kp_min,
            ki: Math.random() * (this.searchSpace.ki_max - this.searchSpace.ki_min) + this.searchSpace.ki_min,
            kd: Math.random() * (this.searchSpace.kd_max - this.searchSpace.kd_min) + this.searchSpace.kd_min
        };
    }
    
    updateVisualization() {
        const canvas = document.getElementById('bayesian-space-chart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (this.samples.length === 0) return;
        
        // For visualization, we'll plot Kp vs Kd (most important dimensions)
        const padding = 40;
        const width = canvas.width - 2 * padding;
        const height = canvas.height - 2 * padding;
        
        // Draw axes
        ctx.strokeStyle = '#61dafb';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, canvas.height - padding);
        ctx.lineTo(canvas.width - padding, canvas.height - padding);
        ctx.stroke();
        
        // Labels
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Arial';
        ctx.fillText('Kp', canvas.width - padding + 5, canvas.height - padding + 5);
        ctx.fillText('Kd', padding - 30, padding);
        
        // Find best sample
        const validSamples = this.samples.filter(s => s.fitness !== Infinity);
        const bestSample = validSamples.length > 0 ? 
                          validSamples.reduce((a, b) => a.fitness < b.fitness ? a : b) : null;
        
        // Plot all samples
        this.samples.forEach(sample => {
            if (sample.fitness === Infinity) return;
            
            const x = padding + ((sample.kp - this.searchSpace.kp_min) / (this.searchSpace.kp_max - this.searchSpace.kp_min)) * width;
            const y = canvas.height - padding - ((sample.kd - this.searchSpace.kd_min) / (this.searchSpace.kd_max - this.searchSpace.kd_min)) * height;
            
            // Color based on fitness (gradient from red=bad to blue=good)
            const minFitness = Math.min(...validSamples.map(s => s.fitness));
            const maxFitness = Math.max(...validSamples.map(s => s.fitness));
            const normalized = (maxFitness - minFitness) > 0 ? (sample.fitness - minFitness) / (maxFitness - minFitness) : 0;
            const hue = (1 - normalized) * 240; // 240=blue (good), 0=red (bad)
            
            ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, 2 * Math.PI);
            ctx.fill();
        });
        
        // Highlight best sample
        if (bestSample) {
            const x = padding + ((bestSample.kp - this.searchSpace.kp_min) / (this.searchSpace.kp_max - this.searchSpace.kp_min)) * width;
            const y = canvas.height - padding - ((bestSample.kd - this.searchSpace.kd_min) / (this.searchSpace.kd_max - this.searchSpace.kd_min)) * height;
            
            ctx.strokeStyle = '#a2f279';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(x, y, 8, 0, 2 * Math.PI);
            ctx.stroke();
        }
    }
    
    async run() {
        this.isRunning = true;
        
        const progressEl = document.getElementById('tuning-progress-panel');
        if (progressEl) progressEl.style.display = 'block';
        showNotification('Inicjalizacja Bayesian Optimization...');
        
        await this.initialize();
        
        while (this.iteration < this.iterations && this.isRunning) {
            // 1. Select next sample using acquisition function
            const nextSample = await this.acquireNext();
            
            if (!nextSample) {
                console.error('Failed to acquire next sample');
                break;
            }
            
            // 2. Evaluate it
            try {
                const fitness = await this.evaluateSample(nextSample);
                this.samples.push({...nextSample, fitness});
            } catch (error) {
                console.error('Sample evaluation failed:', error);
                this.samples.push({...nextSample, fitness: Infinity});
            }
            
            // 3. Update surrogate model
            await this.trainSurrogate();
            
            // 4. Update visualization and display
            const validSamples = this.samples.filter(s => s.fitness !== Infinity);
            const best = validSamples.length > 0 ? 
                        validSamples.reduce((a, b) => a.fitness < b.fitness ? a : b) : null;
            
            if (best) {
                updateBestDisplay(best);
                updateProgressDisplay(this.iteration + 1, this.iterations, best.fitness);
            }
            
            this.updateVisualization();
            
            this.iteration++;
        }
        
        this.isRunning = false;
        
        const validSamples = this.samples.filter(s => s.fitness !== Infinity);
        const best = validSamples.length > 0 ? 
                    validSamples.reduce((a, b) => a.fitness < b.fitness ? a : b) : null;
        
        if (best) {
            showNotification(`Bayesian Optimization zakończona! Najlepsze fitness: ${best.fitness.toFixed(4)}`);
        } else {
            showNotification('Bayesian Optimization zakończona - brak udanych testów');
        }
    }
    
    stop() { 
        this.isRunning = false;
        // Restore baseline PID when stopping
        sendBaselinePIDToRobot();
    }
}