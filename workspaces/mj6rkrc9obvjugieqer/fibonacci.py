```python
def fibonacci(n):
    """
    Calculate the nth Fibonacci number using an iterative approach.

    Args:
        n (int): The position in the Fibonacci sequence (0-indexed).

    Returns:
        int: The nth Fibonacci number.
    """
    if n < 0:
        raise ValueError("Input must be a non-negative integer.")
    elif n == 0:
        return 0
    elif n == 1:
        return 1

    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    return b


if __name__ == "__main__":
    try:
        user_input = int(input("Enter a non-negative integer to get Fibonacci number: "))
        print(f"Fibonacci number at position {user_input} is: {fibonacci(user_input)}")
    except ValueError as e:
        print(f"Invalid input: {e}")
```

You can run this script in your Python environment and enter a number when prompted to get its Fibonacci number. Would you like me to add anything else, like generating a list of Fibonacci numbers or optimizing further?