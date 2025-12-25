# Just Div

Just Div is a responsive, grid-based math puzzle game built with JavaScript and the Phaser 3 framework. The goal is to keep the board clear by merging and dividing number tiles while managing your resources.

## 🎮 How to Play

1.  **Drag and Drop**: Drag number tiles from the queue (bottom or right panel) onto the 4x4 grid.
2.  **Merge Numbers**: Place a tile on top of an identical number to merge them.
    * *Example:* Drop a `4` on a `4` → they merge into `8`. (Score x2)
3.  **Divide Numbers**: Place a tile on a number that divides it perfectly.
    * *Example:* Drop a `5` on a `20` → `20 ÷ 5 = 4`. The result `4` stays on the board.
4.  **Game Over**: The game ends when the grid is full and no more moves can be made.

## 🛠 Features

* **Responsive Layout**: Automatically adjusts between Portrait (Mobile) and Landscape (Desktop) modes.
* **Tools**:
    * **Keep Zone**: Save a tile for later use.
    * **Trash**: Discard unwanted tiles (Limited uses!).
* **Hint System**: Press `G` to toggle visual hints that show valid moves.
* **Undo Function**: Made a mistake? Press `Z` to undo your last move.
* **Difficulty Modes**: Choose between Easy, Medium, and Hard number sets.

## ⌨️ Controls

| Key | Action |
| :--- | :--- |
| **Mouse / Touch** | Drag and drop tiles |
| **Z** | Undo last move |
| **R** | Restart game |
| **G** | Toggle Hints (On/Off) |
| **ESC** | Pause Game |
| **1, 2, 3** | Set Difficulty (Easy, Medium, Hard) |

## 🚀 How to Run

1.  Download the project files.
2.  Ensure you have the `assets` folder containing the game images (bg_desktop.jpg, Cat.png, etc.) in the same directory.
3.  Since this game uses Phaser 3, it requires a local web server to load assets correctly due to browser security policies.
    * **VS Code Users**: Install the "Live Server" extension, right-click `index.html`, and select "Open with Live Server".
    * **Python Users**: Run `python -m http.server` in the terminal and open `localhost:8000`.
4.  You could also run it on the deployed vercel server 'http://justdiv.vercel.app/'

## 📝 License

This project is free to use for educational and personal purposes.