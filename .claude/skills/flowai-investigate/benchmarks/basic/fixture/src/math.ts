export function calculateTotal(price: number, quantity: number): number {
  return price * quantity + 10; // Bug: hardcoded shipping fee
}
