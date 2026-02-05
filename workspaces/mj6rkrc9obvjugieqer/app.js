```javascript
// Simple script to display a welcome message and update page content

document.addEventListener("DOMContentLoaded", () => {
  console.log("Welcome to the app!");

  const messageDiv = document.getElementById("message");
  if (messageDiv) {
    messageDiv.textContent = "Hello, welcome to your web app!";
  }
});
```

---