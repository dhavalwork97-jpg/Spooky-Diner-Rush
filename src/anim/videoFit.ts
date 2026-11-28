import Phaser from 'phaser';

/**
 * A video has no size until its first frame is ready, so keep trying until the real pixel size is known, then scale it over `area`.
 * Phaser swaps in the real-size texture a moment after the first frame, so the scale is applied again shortly after.
 */
export function fitVideo(scene: Phaser.Scene, v: Phaser.GameObjects.Video, area: { width: number; height: number }, isDead: () => boolean = () => false): void {
  const apply = (): boolean => {
    const el = v.video;
    if (!v.active || !el || el.videoWidth <= 0 || el.videoHeight <= 0) return false;
    v.setScale(area.width / el.videoWidth, area.height / el.videoHeight);
    return true;
  };
  const again = (): void => {
    apply();
    scene.time.delayedCall(400, apply);
  };
  v.once(Phaser.GameObjects.Events.VIDEO_CREATED, again);
  v.once(Phaser.GameObjects.Events.VIDEO_PLAY, again);
  const poll = (n: number): void => {
    if (isDead() || !v.active || n > 50) return;
    if (apply()) {
      scene.time.delayedCall(400, apply);
      return;
    }
    scene.time.delayedCall(100, () => poll(n + 1));
  };
  poll(0);
}
