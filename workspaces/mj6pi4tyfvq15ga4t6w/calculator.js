```js
/**
 * Adds two numbers and returns their sum.
 *
 * @param {number} a - The first number to add.
 * @param {number} b - The second number to add.
 * @returns {number} The sum of a and b.
 */
function add(a, b) {
  return a + b;
}

/**
 * Subtracts the second number from the first number and returns the difference.
 *
 * @param {number} a - The number to subtract from (minuend).
 * @param {number} b - The number to subtract (subtrahend).
 * @returns {number} The difference (a minus b).
 */
function subtract(a, b) {
  return a - b;
}

/**
 * Multiplies two numbers and returns the product.
 *
 * @param {number} a - The first number to multiply.
 * @param {number} b - The second number to multiply.
 * @returns {number} The product of a and b.
 */
function multiply(a, b) {
  return a * b;
}

/**
 * Divides the first number by the second and returns the quotient.
 * Throws an error if dividing by zero.
 *
 * @param {number} a - The numerator.
 * @param {number} b - The denominator.
 * @returns {number} The quotient of a divided by b.
 * @throws {Error} Throws if b is zero to prevent division by zero.
 */
function divide(a, b) {
  if (b === 0) {
    throw new Error('Division by zero is not allowed.');
  }
  return a / b;
}

// Exporting the calculator functions to enable importing in other files
module.exports = { add, subtract, multiply, divide };
```

Let me know if you'd like a usage example or any tests for these functions!