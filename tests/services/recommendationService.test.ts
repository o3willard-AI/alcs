import { RecommendationService } from '../../src/services/recommendationService';
import { SessionState, StateMachineState, Defect } from '../../src/types/mcp';

describe('RecommendationService', () => {
  let service: RecommendationService;

  beforeEach(() => {
    service = new RecommendationService();
  });

  describe('generateRecommendations', () => {
    it('should generate recommendations for a complete session', async () => {
      const session: SessionState = {
        session_id: 'test-session',
        state: StateMachineState.CONVERGED,
        current_iteration: 3,
        max_iterations: 5,
        quality_threshold: 80,
        last_quality_score: 85,
        score_history: [60, 70, 85],
        content_hashes: [],
        artifacts: [
          {
            id: 'code-1',
            type: 'code',
            description: 'Python code',
            content: 'def hello():\n    return "Hello"',
            timestamp: Date.now(),
            metadata: { language: 'Python' }
          },
          {
            id: 'review-1',
            type: 'review',
            description: 'Review',
            content: JSON.stringify({
              defects: [
                { type: 'style', severity: 'low', message: 'Missing docstring', location: 'hello:1' }
              ]
            }),
            timestamp: Date.now()
          }
        ]
      };

      const recommendations = await service.generateRecommendations(session);

      expect(recommendations).toBeDefined();
      expect(Array.isArray(recommendations)).toBe(true);
      expect(recommendations.length).toBeGreaterThan(0);
    });

    it('should handle session with no artifacts', async () => {
      const session: SessionState = {
        session_id: 'test-session',
        state: StateMachineState.IDLE,
        current_iteration: 0,
        max_iterations: 5,
        quality_threshold: 80,
        last_quality_score: undefined,
        score_history: [],
        content_hashes: [],
        artifacts: []
      };

      const recommendations = await service.generateRecommendations(session);

      expect(recommendations).toBeDefined();
      expect(Array.isArray(recommendations)).toBe(true);
    });
  });

  describe('analyzeDefectPatterns', () => {
    it('should detect recurring defect patterns', async () => {
      const session: SessionState = {
        session_id: 'test-session',
        state: StateMachineState.REVIEWING,
        current_iteration: 3,
        max_iterations: 5,
        quality_threshold: 80,
        last_quality_score: 70,
        score_history: [65, 68, 70],
        content_hashes: [],
        artifacts: [
          {
            id: 'review-1',
            type: 'review',
            description: 'Review 1',
            content: JSON.stringify({
              defects: [
                { type: 'naming', severity: 'low', message: 'Poor variable name', location: 'file.py:10' },
                { type: 'naming', severity: 'low', message: 'Poor function name', location: 'file.py:20' },
                { type: 'naming', severity: 'low', message: 'Poor class name', location: 'file.py:30' }
              ]
            }),
            timestamp: Date.now()
          }
        ]
      };

      const recommendations = await service.generateRecommendations(session);

      const patternRecs = recommendations.filter(r => r.type === 'pattern');
      expect(patternRecs.length).toBeGreaterThan(0);

      const recurringRec = patternRecs.find(r => r.message.includes('Recurring defect pattern'));
      expect(recurringRec).toBeDefined();
      expect(recurringRec?.message).toContain('naming');
    });

    it('should detect critical defects', async () => {
      const session: SessionState = {
        session_id: 'test-session',
        state: StateMachineState.REVIEWING,
        current_iteration: 1,
        max_iterations: 5,
        quality_threshold: 80,
        last_quality_score: 50,
        score_history: [50],
        content_hashes: [],
        artifacts: [
          {
            id: 'review-1',
            type: 'review',
            description: 'Review',
            content: JSON.stringify({
              defects: [
                { type: 'bug', severity: 'critical', message: 'Null pointer exception', location: 'file.py:10' }
              ]
            }),
            timestamp: Date.now()
          }
        ]
      };

      const recommendations = await service.generateRecommendations(session);

      const criticalRecs = recommendations.filter(r => r.severity === 'critical');
      expect(criticalRecs.length).toBeGreaterThan(0);

      const criticalDefectRec = criticalRecs.find(r => r.message.includes('critical defects'));
      expect(criticalDefectRec).toBeDefined();
    });

    it('should detect security vulnerabilities', async () => {
      const session: SessionState = {
        session_id: 'test-session',
        state: StateMachineState.REVIEWING,
        current_iteration: 1,
        max_iterations: 5,
        quality_threshold: 80,
        last_quality_score: 60,
        score_history: [60],
        content_hashes: [],
        artifacts: [
          {
            id: 'review-1',
            type: 'review',
            description: 'Review',
            content: JSON.stringify({
              defects: [
                { type: 'security', severity: 'high', message: 'SQL injection vulnerability', location: 'db.py:50' }
              ]
            }),
            timestamp: Date.now()
          }
        ]
      };

      const recommendations = await service.generateRecommendations(session);

      const securityRecs = recommendations.filter(r => r.message.toLowerCase().includes('security'));
      expect(securityRecs.length).toBeGreaterThan(0);
    });
  });

  describe('analyzeImprovementTrend', () => {
    it('should detect excellent improvement', async () => {
      const session: SessionState = {
        session_id: 'test-session',
        state: StateMachineState.REVIEWING,
        current_iteration: 3,
        max_iterations: 5,
        quality_threshold: 80,
        last_quality_score: 90,
        score_history: [50, 70, 90], // 80% improvement
        content_hashes: [],
        artifacts: []
      };

      const recommendations = await service.generateRecommendations(session);

      const trendRecs = recommendations.filter(r => r.type === 'trend');
      expect(trendRecs.length).toBeGreaterThan(0);

      const excellentRec = trendRecs.find(r => r.message.includes('Excellent improvement'));
      expect(excellentRec).toBeDefined();
    });

    it('should detect quality decline', async () => {
      const session: SessionState = {
        session_id: 'test-session',
        state: StateMachineState.REVIEWING,
        current_iteration: 3,
        max_iterations: 5,
        quality_threshold: 80,
        last_quality_score: 60,
        score_history: [75, 70, 60], // Declining
        content_hashes: [],
        artifacts: []
      };

      const recommendations = await service.generateRecommendations(session);

      const warningRecs = recommendations.filter(r => r.severity === 'warning');
      expect(warningRecs.length).toBeGreaterThan(0);

      const declineRec = warningRecs.find(r => r.message.includes('declining'));
      expect(declineRec).toBeDefined();
    });

    it('should detect proximity to threshold', async () => {
      const session: SessionState = {
        session_id: 'test-session',
        state: StateMachineState.REVIEWING,
        current_iteration: 2,
        max_iterations: 5,
        quality_threshold: 80,
        last_quality_score: 75,
        score_history: [65, 75],
        content_hashes: [],
        artifacts: []
      };

      const recommendations = await service.generateRecommendations(session);

      const proximityRec = recommendations.find(r => r.message.includes('Close to quality threshold'));
      expect(proximityRec).toBeDefined();
    });
  });

  describe('detectStagnation', () => {
    it('should detect stagnation below threshold', async () => {
      const session: SessionState = {
        session_id: 'test-session',
        state: StateMachineState.REVISING,
        current_iteration: 4,
        max_iterations: 5,
        quality_threshold: 80,
        last_quality_score: 70,
        score_history: [69, 70, 70, 70], // Stagnant at 70
        content_hashes: [],
        artifacts: []
      };

      const recommendations = await service.generateRecommendations(session);

      const stagnationRecs = recommendations.filter(r => r.type === 'stagnation');
      expect(stagnationRecs.length).toBeGreaterThan(0);

      const stagnantRec = stagnationRecs.find(r => r.message.includes('stagnating'));
      expect(stagnantRec).toBeDefined();
      expect(stagnantRec?.severity).toBe('warning');
    });

    it('should detect stabilization above threshold', async () => {
      const session: SessionState = {
        session_id: 'test-session',
        state: StateMachineState.REVIEWING,
        current_iteration: 3,
        max_iterations: 5,
        quality_threshold: 80,
        last_quality_score: 85,
        score_history: [84, 85, 85], // Stable above threshold
        content_hashes: [],
        artifacts: []
      };

      const recommendations = await service.generateRecommendations(session);

      const stabilizedRec = recommendations.find(r => r.message.includes('stabilized'));
      expect(stabilizedRec).toBeDefined();
    });

    it('should warn when approaching max iterations', async () => {
      const session: SessionState = {
        session_id: 'test-session',
        state: StateMachineState.REVISING,
        current_iteration: 4,
        max_iterations: 5,
        quality_threshold: 80,
        last_quality_score: 70,
        score_history: [65, 68, 70, 70],
        content_hashes: [],
        artifacts: []
      };

      const recommendations = await service.generateRecommendations(session);

      const maxIterRec = recommendations.find(r => r.message.includes('max iterations'));
      expect(maxIterRec).toBeDefined();
      expect(maxIterRec?.severity).toBe('critical');
    });
  });

  describe('generateLanguageTips', () => {
    it('should provide Python best practices', async () => {
      const session: SessionState = {
        session_id: 'test-session',
        state: StateMachineState.CODING,
        current_iteration: 1,
        max_iterations: 5,
        quality_threshold: 80,
        last_quality_score: undefined,
        score_history: [],
        content_hashes: [],
        artifacts: [
          {
            id: 'code-1',
            type: 'code',
            description: 'Python code',
            content: 'def hello():\n    pass',
            timestamp: Date.now(),
            metadata: { language: 'Python' }
          }
        ]
      };

      const recommendations = await service.generateRecommendations(session);

      const languageRecs = recommendations.filter(r => r.type === 'language');
      expect(languageRecs.length).toBeGreaterThan(0);

      const pythonRec = languageRecs.find(r => r.message.includes('Python'));
      expect(pythonRec).toBeDefined();
      expect(pythonRec?.details).toContain('PEP 8');
    });

    it('should provide JavaScript best practices', async () => {
      const session: SessionState = {
        session_id: 'test-session',
        state: StateMachineState.CODING,
        current_iteration: 1,
        max_iterations: 5,
        quality_threshold: 80,
        last_quality_score: undefined,
        score_history: [],
        content_hashes: [],
        artifacts: [
          {
            id: 'code-1',
            type: 'code',
            description: 'JS code',
            content: 'function hello() { }',
            timestamp: Date.now(),
            metadata: { language: 'JavaScript' }
          }
        ]
      };

      const recommendations = await service.generateRecommendations(session);

      const jsRec = recommendations.find(r => r.message.includes('JavaScript'));
      expect(jsRec).toBeDefined();
      expect(jsRec?.details).toContain('const/let');
    });
  });

  describe('generateFrameworkTips', () => {
    it('should provide pytest best practices', async () => {
      const session: SessionState = {
        session_id: 'test-session',
        state: StateMachineState.REVIEWING,
        current_iteration: 1,
        max_iterations: 5,
        quality_threshold: 80,
        last_quality_score: 75,
        score_history: [75],
        content_hashes: [],
        artifacts: [
          {
            id: 'test-1',
            type: 'test',
            description: 'pytest tests',
            content: 'def test_hello():\n    assert True',
            timestamp: Date.now(),
            metadata: { test_framework: 'pytest' }
          }
        ]
      };

      const recommendations = await service.generateRecommendations(session);

      const frameworkRecs = recommendations.filter(r => r.type === 'framework');
      expect(frameworkRecs.length).toBeGreaterThan(0);

      const pytestRec = frameworkRecs.find(r => r.message.includes('pytest'));
      expect(pytestRec).toBeDefined();
      expect(pytestRec?.details).toContain('fixtures');
    });

    it('should warn when no tests are present', async () => {
      const session: SessionState = {
        session_id: 'test-session',
        state: StateMachineState.REVIEWING,
        current_iteration: 1,
        max_iterations: 5,
        quality_threshold: 80,
        last_quality_score: 70,
        score_history: [70],
        content_hashes: [],
        artifacts: [
          {
            id: 'code-1',
            type: 'code',
            description: 'Code',
            content: 'def hello(): pass',
            timestamp: Date.now()
          }
        ]
      };

      const recommendations = await service.generateRecommendations(session);

      const noTestRec = recommendations.find(r => r.message.includes('No test artifacts'));
      expect(noTestRec).toBeDefined();
      expect(noTestRec?.severity).toBe('warning');
    });
  });

  describe('analyzeModelPerformance', () => {
    it('should suggest different model for poor performance', async () => {
      const session: SessionState = {
        session_id: 'test-session',
        state: StateMachineState.REVISING,
        current_iteration: 3,
        max_iterations: 5,
        quality_threshold: 80,
        last_quality_score: 55,
        score_history: [50, 52, 55],
        content_hashes: [],
        artifacts: []
      };

      const recommendations = await service.generateRecommendations(session);

      const modelRecs = recommendations.filter(r => r.type === 'model');
      expect(modelRecs.length).toBeGreaterThan(0);

      const modelSuggestion = modelRecs.find(r => r.message.includes('different model'));
      expect(modelSuggestion).toBeDefined();
    });

    it('should not suggest model change for good performance', async () => {
      const session: SessionState = {
        session_id: 'test-session',
        state: StateMachineState.REVIEWING,
        current_iteration: 2,
        max_iterations: 5,
        quality_threshold: 80,
        last_quality_score: 85,
        score_history: [75, 85],
        content_hashes: [],
        artifacts: []
      };

      const recommendations = await service.generateRecommendations(session);

      const modelRecs = recommendations.filter(r => r.type === 'model');
      expect(modelRecs.length).toBe(0);
    });
  });

  describe('language detection', () => {
    it('should detect Python from imports', async () => {
      const session: SessionState = {
        session_id: 'test-session',
        state: StateMachineState.CODING,
        current_iteration: 1,
        max_iterations: 5,
        quality_threshold: 80,
        last_quality_score: undefined,
        score_history: [],
        content_hashes: [],
        artifacts: [
          {
            id: 'code-1',
            type: 'code',
            description: 'Code',
            content: 'import os\nimport sys',
            timestamp: Date.now()
          }
        ]
      };

      const recommendations = await service.generateRecommendations(session);
      const pythonRec = recommendations.find(r => r.message.includes('Python'));
      expect(pythonRec).toBeDefined();
    });

    it('should detect Go from package declaration', async () => {
      const session: SessionState = {
        session_id: 'test-session',
        state: StateMachineState.CODING,
        current_iteration: 1,
        max_iterations: 5,
        quality_threshold: 80,
        last_quality_score: undefined,
        score_history: [],
        content_hashes: [],
        artifacts: [
          {
            id: 'code-1',
            type: 'code',
            description: 'Code',
            content: 'package main\n\nfunc main() {}',
            timestamp: Date.now()
          }
        ]
      };

      const recommendations = await service.generateRecommendations(session);
      const goRec = recommendations.find(r => r.message.includes('Go'));
      expect(goRec).toBeDefined();
    });
  });
});
