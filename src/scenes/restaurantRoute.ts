import type Phaser from 'phaser';

/** Which scene runs which restaurant. One place, so every "pick a restaurant" screen (diner, Taco Truck, Pizza Place) routes the same way. */
export const TACO_ID = 'taco_truck';
export const PIZZA_ID = 'pizza_place';

export function startRestaurant(scene: Phaser.Scene, id: string): void {
  if (id === TACO_ID) scene.scene.start('Taco');
  else if (id === PIZZA_ID) scene.scene.start('Pizza');
  else scene.scene.start('Game', { restaurantId: id });
}
