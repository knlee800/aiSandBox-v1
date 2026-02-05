```python
import math

def add(x, y):
    return x + y

def multiply(x, y):
    return x * y

def divide(x, y):
    if y == 0:
        return "Error: Division by zero is not allowed."
    return x / y

def power(x, y):
    return x ** y

def modulo(x, y):
    if y == 0:
        return "Error: Modulo by zero is not allowed."
    return x % y

def square_root(x):
    if x < 0:
        return "Error: Cannot take square root of a negative number."
    return math.sqrt(x)

def advanced_calculator():
    print("Advanced Calculator")
    print("Select operation:")
    print("1. Add")
    print("2. Multiply")
    print("3. Divide")
    print("4. Power (x^y)")
    print("5. Modulo (x % y)")
    print("6. Square Root")
    
    while True:
        choice = input("Enter choice (1-6): ")
        if choice in ('1','2','3','4','5','6'):
            break
        print("Invalid input, please enter a number between 1 and 6.")

    try:
        if choice == '6':
            num = float(input("Enter a number: "))
        else:
            num = float(input("Enter first number: "))
            num2 = float(input("Enter second number: "))
    except ValueError:
        print("Invalid input. Please enter numeric values.")
        return

    if choice == '1':
        print(f"{num} + {num2} = {add(num, num2)}")
    elif choice == '2':
        print(f"{num} * {num2} = {multiply(num, num2)}")
    elif choice == '3':
        result = divide(num, num2)
        print(f"{num} / {num2} = {result}")
    elif choice == '4':
        print(f"{num} ^ {num2} = {power(num, num2)}")
    elif choice == '5':
        result = modulo(num, num2)
        print(f"{num} % {num2} = {result}")
    elif choice == '6':
        result = square_root(num)
        print(f"Square root of {num} = {result}")

if __name__ == "__main__":
    advanced_calculator()
```

The subtraction function and option have been fully removed. If you'd like modifications to other parts or other features removed, just let me know!