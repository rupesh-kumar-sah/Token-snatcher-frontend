import * as Phaser from 'phaser';
import {
  TOKEN_CONFIG,
  TOKEN_RADIUS,
  RANKED_DURATION_SECONDS,
  GAME_WIDTH,
  GAME_HEIGHT,
  GOLDEN_TOKEN_BONUS_POINTS,
  GOLDEN_TOKEN_MULTIPLIER,
} from '@/utils/constants';
import { createScoreState, addScore, resetScore, ScoreState } from '@/utils/scoring';
import { positionKey, SpawnPoint } from '@/utils/spawnLogic';
import { TokenType } from '@/utils/constants';
import { TokenSpawnEngine, SpawnEvent } from '@/game/TokenSpawnEngine';

interface GameConfig {
  mode: 'ranked' | 'free';
  seed?: number;
  onScoreUpdate?: (score: number, combo: number) => void;
  onGameOver?: (finalScore: number) => void;
  onClickSound?: () => void;
  onSuccessSound?: () => void;
  onErrorSound?: () => void;
}

export class GameScene extends Phaser.Scene {
  private tokens: Phaser.GameObjects.Container[] = [];
  private scoreState: ScoreState = createScoreState();
  private spawnEngine!: TokenSpawnEngine;
  private gameTimer!: Phaser.Time.TimerEvent | null;
  private timeRemaining = 0;
  private mode: 'ranked' | 'free' = 'free';
  private seed?: number;
  private onScoreUpdate?: (score: number, combo: number) => void;
  private onGameOver?: (finalScore: number) => void;
  private onClickSound?: () => void;
  private onSuccessSound?: () => void;
  private onErrorSound?: () => void;
  private isGameOver = false;
  private sessionStartTime = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private goldenLabelText?: Phaser.GameObjects.Text;
  private background!: Phaser.GameObjects.Rectangle;
  private particleEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor() {
    super({ key: 'GameScene' });
  }

  init(data: GameConfig): void {
    this.mode = data.mode ?? 'free';
    this.seed = data.seed;
    this.onScoreUpdate = data.onScoreUpdate;
    this.onGameOver = data.onGameOver;
    this.onClickSound = data.onClickSound;
    this.onSuccessSound = data.onSuccessSound;
    this.onErrorSound = data.onErrorSound;
  }

  create(): void {
    this.resetState();
    this.sessionStartTime = Date.now();

    this.background = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0f172a).setOrigin(0, 0);

    this.scoreText = this.add.text(16, 16, 'Score: 0', {
      fontSize: '24px', color: '#ffffff', fontFamily: 'monospace',
    });

    this.comboText = this.add.text(16, 48, '', {
      fontSize: '18px', color: '#f59e0b', fontFamily: 'monospace',
    });

    this.timerText = this.add.text(GAME_WIDTH - 16, 16, '', {
      fontSize: '24px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(1, 0);

    if (this.mode === 'ranked') {
      this.timeRemaining = RANKED_DURATION_SECONDS;
      this.timerText.setText(`${this.timeRemaining}s`);
      this.gameTimer = this.time.addEvent({
        delay: 1000,
        callback: this.onTimerTick,
        callbackScope: this,
        loop: true,
      });
    } else {
      this.timerText.setText('∞');
    }

    this.spawnEngine = new TokenSpawnEngine(
      this,
      (events: SpawnEvent[]) => {
        for (const e of events) this.createToken(e.position, e.type);
      },
      {
        seed: this.seed,
        difficultyScaling: true,
      },
    );
    this.spawnEngine.start();
  }

  private resetState(): void {
    this.tokens = [];
    this.scoreState = resetScore();
    this.timeRemaining = 0;
    this.isGameOver = false;
  }

  private onTimerTick(): void {
    if (this.isGameOver) return;
    this.timeRemaining--;
    this.timerText.setText(`${this.timeRemaining}s`);
    if (this.timeRemaining <= 0) this.endGame();
  }

  private createToken(pos: SpawnPoint, type: TokenType): void {
    const config = TOKEN_CONFIG[type];
    const isGolden = Boolean(config.isGolden);

    const container = this.add.container(pos.x, pos.y);
    const circle = this.add.circle(0, 0, TOKEN_RADIUS, config.color);
    circle.setStrokeStyle(2, 0xffffff, 0.5);
    const inner = this.add.circle(0, 0, TOKEN_RADIUS - 6, config.color, 0.3);
    inner.setStrokeStyle(1, config.color, 0.8);

    const goldenRing = isGolden ? this.add.circle(0, 0, TOKEN_RADIUS + 10, 0xfbbf24, 0.0) : null;
    if (goldenRing) {
      goldenRing.setStrokeStyle(4, 0xfbbf24, 0.9);
      this.tweens.add({
        targets: goldenRing, alpha: { from: 0.2, to: 1 },
        duration: 450, yoyo: true, repeat: -1,
      });
    }

    const label = this.add.text(0, 0, isGolden ? 'G' : '$', {
      fontSize: '24px', color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5);

    container.add(isGolden ? [circle, inner, goldenRing!, label] : [circle, inner, label]);
    container.setSize(TOKEN_RADIUS * 2, TOKEN_RADIUS * 2);
    container.setInteractive(new Phaser.Geom.Circle(0, 0, TOKEN_RADIUS), Phaser.Geom.Circle.Contains);

    container.on('pointerdown', () => this.snatchToken(container, config.points, isGolden));
    container.on('pointerover', () => { circle.setScale(1.15); inner.setScale(1.15); label.setScale(1.15); goldenRing?.setScale?.(1.03); });
    container.on('pointerout',  () => { circle.setScale(1);    inner.setScale(1);    label.setScale(1);    goldenRing?.setScale?.(1);    });

    this.spawnEngine.markOccupied(pos.x, pos.y);
    this.tokens.push(container);

    // Spawn-in animation: scale + fade from 0
    container.setScale(0);
    container.setAlpha(0);
    this.tweens.add({
      targets: container,
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      duration: 220,
      ease: 'Back.easeOut',
    });

    const EXPIRE_ANIM_MS = 300;
    const WARN_THRESHOLD = 0.4;

    this.time.delayedCall(config.lifetimeMs * (1 - WARN_THRESHOLD), () => {
      if (!container.active) return;
      this.tweens.add({
        targets: container, scaleX: 0.85, scaleY: 0.85,
        duration: 120, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    });

    this.time.delayedCall(config.lifetimeMs - EXPIRE_ANIM_MS, () => {
      if (!container.active) return;
      this.tweens.killTweensOf(container);
      this.tweens.add({
        targets: container, alpha: 0, scaleX: 0, scaleY: 0,
        duration: EXPIRE_ANIM_MS, ease: 'Back.easeIn',
        onComplete: () => this.removeToken(container),
      });
    });
  }

  private snatchToken(container: Phaser.GameObjects.Container, basePoints: number, isGolden = false): void {
    if (this.isGameOver) return;

    if (isGolden) {
      this.onSuccessSound?.();
    } else {
      this.onClickSound?.();
    }

    const now = Date.now();
    const awardedBasePoints = isGolden
      ? Math.round((basePoints + GOLDEN_TOKEN_BONUS_POINTS) * GOLDEN_TOKEN_MULTIPLIER)
      : basePoints;

    const { state, earnedPoints } = addScore(this.scoreState, awardedBasePoints, now);
    this.scoreState = state;
    this.updateUI();
    this.onScoreUpdate?.(this.scoreState.score, this.scoreState.combo);

    this.spawnEngine.markFree(container.x, container.y);
    const idx = this.tokens.indexOf(container);
    if (idx !== -1) this.tokens.splice(idx, 1);
    container.disableInteractive();

    this.tweens.killTweensOf(container);
    this.tweens.add({
      targets: container, scaleX: 1.5, scaleY: 1.5, alpha: 0,
      duration: 200, ease: 'Quad.easeOut',
      onComplete: () => container.destroy(),
    });

    this.showScoreIndicator(container.x, container.y, earnedPoints, isGolden);

    if (isGolden) {
      this.showGoldenLabel(container.x, container.y);
    }
  }

  private showScoreIndicator(x: number, y: number, points: number, isGolden = false): void {
    const color = isGolden ? '#fbbf24' : this.scoreState.combo > 1 ? '#34d399' : '#ffffff';
    const label = this.add.text(x, y - TOKEN_RADIUS - 8, `+${points}`, {
      fontSize: isGolden ? '22px' : '18px',
      color,
      fontFamily: 'monospace',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 0.5).setDepth(10);

    this.tweens.add({
      targets: label,
      y: y - TOKEN_RADIUS - 60,
      alpha: { from: 1, to: 0 },
      scaleX: { from: 1.2, to: 0.8 },
      scaleY: { from: 1.2, to: 0.8 },
      duration: 750,
      ease: 'Cubic.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  private removeToken(container: Phaser.GameObjects.Container): void {
    if (!container.active) return;
    this.spawnEngine.markFree(container.x, container.y);
    const idx = this.tokens.indexOf(container);
    if (idx !== -1) this.tokens.splice(idx, 1);
    this.tweens.killTweensOf(container);
    container.destroy();
  }

  private showGoldenLabel(x: number, y: number): void {
    this.goldenLabelText?.destroy();
    const label = this.add.text(x, y - TOKEN_RADIUS - 12, `GOLDEN! +${GOLDEN_TOKEN_BONUS_POINTS}`, {
      fontSize: '16px', color: '#fbbf24', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5);
    this.goldenLabelText = label;
    this.tweens.add({
      targets: label, y: y - TOKEN_RADIUS - 42, alpha: { from: 1, to: 0 },
      duration: 700, ease: 'Cubic.easeOut',
      onComplete: () => { label.destroy(); if (this.goldenLabelText === label) this.goldenLabelText = undefined; },
    });
  }

  private updateUI(): void {
    this.scoreText.setText(`Score: ${this.scoreState.score}`);
    if (this.scoreState.combo > 0) {
      this.comboText.setText(`Combo x${(1 + this.scoreState.combo * 0.5).toFixed(1)}`);
    } else {
      this.comboText.setText('');
    }
  }

  private endGame(): void {
    if (this.isGameOver) return;
    this.isGameOver = true;

    this.onErrorSound?.();

    this.spawnEngine?.stop();

    for (const token of [...this.tokens]) {
      this.removeToken(token);
    }

    this.onGameOver?.(this.scoreState.score);
    const duration = Math.round((Date.now() - this.sessionStartTime) / 1000);
    this.scene.start('ResultScene', { score: this.scoreState.score, duration, mode: this.mode });
  }

  handleEndGame(): void { this.endGame(); }
  getScore(): number { return this.scoreState.score; }
  getScoreState(): ScoreState { return { ...this.scoreState }; }
}
