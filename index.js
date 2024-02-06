const express = require("express");
const mongoose = require("mongoose");
const app = express();
const cors = require("cors");
app.use(cors());
const server = require("http").createServer(app);
const { Schema } = mongoose;

/////////////////////////////////////////////////////////////////////////////////////////////////// Подключение к базе данных todo

// Строка подключения к базе данных "todo"
const todoUri =
  "mongodb+srv://a0501856767:wwwwww@cluster0.84cd7x2.mongodb.net/todo?retryWrites=true&w=majority";

// Подключение к базе данных "todo"
const todoConnection = mongoose.createConnection(todoUri);

todoConnection.on(
  "error",
  console.error.bind(console, "Ошибка подключения к Mongo todo:")
);
todoConnection.once("open", () => {
  console.log("Успешное подключение к Mongo todo!");
});

// Определение модели и схемы для задачи
const taskSchema = new mongoose.Schema({
  taskid: String,
  name: String,
  checked: Boolean,
});

// Определение модели и схемы для списка задач
const todoSchema = new mongoose.Schema({
  email: String,
  todoid: String,
  name: String,
  filter: String,
  tasks: [taskSchema],
});
const TodoList = todoConnection.model("TodoList", todoSchema);

// Определение схемы пользователя
const userSchema = new mongoose.Schema({
  userid: String,
  password: String,
  email: String,
  token: String,
});

// Определение модели пользователя
const User = todoConnection.model("User", userSchema);
/////////////////////////////////////////////////////////////////////////////////////////////////// Подключение к базе данных TASKTRACKER
const tasktrackerUri =
  "mongodb+srv://a0501856767:wwwwww@cluster0.84cd7x2.mongodb.net/tasktracker?retryWrites=true&w=majority";
// Подключение к базе данных tasktracker
mongoose.connect(tasktrackerUri);

const tasktrackerConnection = mongoose.connection;

tasktrackerConnection.on(
  "error",
  console.error.bind(console, "Ошибка подключения к Mongo tasktracker:")
);
tasktrackerConnection.once("open", () => {
  console.log("Успешное подключение к Mongo tasktracker!");
});
/////////////////////////////////////////////////////////////////////////////////////////////////// TASKTRACKER SCHEMA
const taskTrackerMainSchema = new Schema({
  projects: [
    {
      projectId: String,
      title: String,
      description: String,
      tasks: [
        {
          taskId: String,
          priority: String,
          user: String,
          status: String,
          title: String,
          startDate: String,
          dueDate: String,
          description: String,
        },
      ],
    },
  ],
  params: {
    priorityList: [
      {
        title: String,
        color: String,
      },
    ],
    usersList: [String],
    statusList: [String],
  },
});

// Создание модели TaskTracker

const TaskTracker = tasktrackerConnection.model(
  "TaskTracker",
  taskTrackerMainSchema
);

///////////////////////////////////////////////////////////////////////////////////////////////////////WEBSOCKETS INIT
const io = require("socket.io")(server, { cors: { origin: "*" } });
///////////////////////////////////////////////////////////////////////////////////////////////////////CHAT WEBSOCKETS
const messageHistory = [];

io.on("connection", (socket) => {
  // Отправка истории сообщений при подключении
  socket.emit("chatData", { messageHistory });

  socket.on("message", (payload) => {
    // Сохранение сообщения в истории
    messageHistory.push(payload);

    // Рассылка сообщения всем клиентам
    io.emit("chatData", { messageHistory, newMessage: payload });
  });

  // обработчик для очистки чата
  socket.on("clearChat", () => {
    // Очистка истории сообщений
    messageHistory.length = 0;

    // Рассылка события об очистке чата всем клиентам
    io.emit("chatCleared");
  });

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////TASKTRACKER WEBSOCKETS

  const getDataformBase = async () => {
    try {
      const data = await TaskTracker.findOne();
      io.emit("dataResponse", data);
      //console.log("отправлено ", data);
    } catch (error) {
      console.error("Error handling data request:", error.message);
      io.emit("dataErrorResponse", "Error fetching data");
    }
  };

  // феч
  socket.on("getDataRequest", async () => {
    try {
      getDataformBase();
    } catch (error) {
      console.error("Error handling data request:", error.message);
      socket.emit("dataErrorResponse", "Error fetching data");
    }
  });

  // Обработка события "Params"
  socket.on("updateParams", async (newParams) => {
    try {
      const newSettingsData = { params: { ...newParams } };

      await TaskTracker.findOneAndUpdate(
        {},
        { $set: newSettingsData },
        { upsert: true }
      );

      getDataformBase();
    } catch (error) {
      console.error("Error saving or retrieving project:", error.message);
    }
  });

  // Обработка события "RemoveBase"

  socket.on("RemoveBase", async () => {
    //console.log("RemoveBase");
    try {
      await TaskTracker.deleteMany({});
      console.log("Все документы успешно удалены");
    } catch (error) {
      console.error("Ошибка при удалении документов:", error);
    } finally {
      getDataformBase();
    }
  });

  // Обработка события "UpdateProject"

  socket.on("UpdateProject", async (data) => {
    try {
      const existingProject = await TaskTracker.findOne({
        "projects.projectId": data.projectId,
      });

      if (existingProject) {
        // Если проект найден, обновляем значения полей
        await TaskTracker.updateOne(
          {
            "projects.projectId": data.projectId,
          },
          {
            $set: {
              "projects.$.title": data.title,
              "projects.$.description": data.description,
            },
          }
        );
      } else {
        // Если data.projectId не найден, создаем новый проект
        await TaskTracker.updateOne(
          {},
          {
            $push: {
              projects: {
                projectId: data.projectId,
                title: data.title,
                description: data.description,
                tasks: [],
              },
            },
          }
        );
      }

      getDataformBase();
    } catch (error) {
      console.error(
        "Ошибка при сохранении или получении проекта:",
        error.message
      );
    }
  });

  // Обработка события "deleteProject"
  socket.on("deleteProject", async (projectId) => {
    try {
      // Удаление проекта с соответствующим id

      const result = await TaskTracker.updateOne(
        {},
        {
          $pull: {
            projects: { projectId: projectId },
          },
        }
      );
      if (result.nModified === 0) {
        console.log("Project not found for del");
      }
      getDataformBase();
    } catch (error) {
      console.error("Error deleting project:", error.message);
    }
  });
  //   ////AddTask
  // socket.on("AddTask", async (projectId, data) => {
  //   try {
  //     const document = await TaskTracker.findOne();
  //     const projectIndex = document.projects.findIndex(
  //       (project) => project.projectId === projectId
  //     );
  //     if (projectIndex === -1) {
  //       console.log("no project", index);
  //       return;
  //     }
  //       document.projects[index].tasks.push(data);
  //     await document.save();
  //   } catch (error) {
  //     console.error("Ошибка при обновлении данных задачи:", error.message);
  //   } finally {
  //     getDataformBase();
  //   }
  // });
  socket.on("UpdateTask", async (projectId, data) => {
    try {
      const document = await TaskTracker.findOne({
        "projects.projectId": projectId,
      });

      const index = document.projects.findIndex(
        (project) => project.projectId === projectId
      );

      if (index === -1) {
        console.log("no project", index);
        return;
      }

      //console.log(document.projects[index].tasks.findIndex(data.taskId) === -1);
      if (
        document.projects[index].tasks.findIndex(
          (task) => task.taskId === data.taskId
        ) === -1
      ) {
        document.projects[index].tasks.push(data);
      } else {
        document.projects[index].tasks = document.projects[index].tasks.map(
          (task) => (task.taskId === data.taskId ? data : task)
        );
      }

      await document.save();
    } catch (error) {
      console.error("Ошибка при обновлении данных задачи:", error.message);
    } finally {
      getDataformBase(); // Перенесено в блок finally
    }
  });

  // Обработка события "deleteTask"
  socket.on("DeleteTask", async (projectId, taskId) => {
    try {
      const document = await TaskTracker.findOne({
        "projects.projectId": projectId,
      });

      const index = document.projects.findIndex(
        (project) => project.projectId === projectId
      );
      if (index === -1) {
        console.log("no project", index);
        return;
      }
      document.projects[index].tasks = document.projects[index].tasks.filter(
        (task) => task.taskId !== taskId
      );

      // Сохранение обновленного проекта
      await document.save();
      getDataformBase();
    } catch (error) {
      console.error("Error deleting project:", error.message);
    }
  });
});

/////////////////////////////////////////////////////////////////////////////////////////////////// USER API
// Проверка токена
function authenticateToken(req, res, next) {
  const token = req.header("Authorization");

  if (token == null) {
    return res.status(401).json({ message: "No Token" });
  }

  try {
    jwt.verify(token, "ваш_секретный_ключ", (err, user) => {
      if (err) {
        console.log("Token verification failed");
        return res.status(403).json({ message: "Token verification failed" });
      }
      req.user = user;
      next();
    });
  } catch (error) {
    console.error("Token verification failed:");
    return res.status(403).json({ message: "Token verification failed" });
  }
}

// Парсинг JSON
app.use(express.json());

// проверка сервака
app.get("/test", async (req, res) => {
  res.status(200).json("hi");
});

/////////////////////////////////

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const router = express.Router();

// Маршрут для получения списка пользователей
app.get("/users", async (req, res) => {
  try {
    const tasks = await User.find();
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Маршрут для регистрации пользователя
app.post("/register", async (req, res) => {
  const { username, password, email, token } = req.body;

  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    console.log(email, "registred");
    const user = new User({
      username: username,
      password: hashedPassword,
      email: email,
      token: token,
    });

    await user.save();

    res.status(201).json({ message: "Пользователь зарегистрирован" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
// Маршрут для входа пользователя
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email: email });

    if (!user) {
      return res.status(404).json({ message: "Пользователь не найден" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ message: "Неверный пароль" });
    }

    if (!user.token) {
      // Генерация токена JWT, только если у пользователя нет токена
      const token = jwt.sign({ email: user.email }, "ваш_секретный_ключ");

      // Обновление пользователя в базе данных с установкой поля "token"
      await User.updateOne({ _id: user._id }, { $set: { token: token } });

      return res.status(200).json({ token: token });
    } else {
      // Возвращаем существующий токен, если он уже существует
      console.log(user.token);
      return res.status(200).json({ token: user.token });
    }
  } catch (error) {
    console.error("Ошибка во время входа:", error);
    res.status(500).json({ message: error.message });
  }
});

// Маршрут для проверки токена пользователя
app.post("/checkToken", async (req, res) => {
  const { email, token } = req.body;

  try {
    const user = await User.findOne({ email, token });
    console.log(user);
    if (!user) {
      return res.status(401).json({ message: "Пользователь не авторизован" });
    }

    return res.status(200).json({ message: "Успех" });
  } catch (error) {
    console.error("Ошибка при проверке токена:", error);
    res.status(500).json({ message: "Ошибка при проверке токена" });
  }
});

// Маршрут для выхода пользователя
app.post("/logout", async (req, res) => {
  const token = req.header("Authorization");

  try {
    const user = await User.findOne({ token: token });

    if (!user) {
      return res.status(404).json({ message: "Токен пользователя не найден" });
    }

    // Удаление токена из базы данных
    await User.updateOne({ token: token }, { $unset: { token: "" } });
    res.status(200).json({ message: "Пользователь вышел" });
  } catch (error) {
    res.status(500).json({ message: "Ошибка при выходе пользователя" });
  }
});

///////////////////////////////////////////////////////////////////////////////////////////////TOOODO API

// Маршрут для получения списка тудулистов, связанных с конкретным пользователем
app.get("/todolists/:email", authenticateToken, async (req, res) => {
  const { email } = req.params;
  try {
    const todoLists = await TodoList.find({ email: email }); // Получение всех списков задач, связанных с данным userid
    res.json(todoLists); // Отправка списка задач в формате JSON
  } catch (err) {
    res.status(500).json({ message: err.message }); // Обработка ошибки сервера
  }
});

// Маршрут для создания нового тудулиста
app.post("/todolists", authenticateToken, async (req, res) => {
  const { email, todoid, name, filter, tasks } = req.body;
  const token = req.header("Authorization");

  if (!token) {
    return res
      .status(401)
      .json({ message: "Требуется токен для создания задачи" });
  }
  try {
    const user = await User.findOne({ token: token });
    if (!user) {
      return res.status(401).json({ message: "Пользователь не авторизован" });
    }
    // Проверяем, совпадает ли токен в запросе с токеном пользователя в базе данных
    if (user.token !== token) {
      return res.status(403).json({ message: "Неверный токен пользователя" });
    }
    const todoList = new TodoList({
      email: user.email,
      todoid,
      name,
      filter,
      tasks,
    });
    const newTodoList = await todoList.save();
    res.status(201).json({ newTodoList, email });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Маршрут для обновления имени тудулиста
app.put("/todolists/:todoid", authenticateToken, async (req, res) => {
  const { todoid } = req.params;
  const { name } = req.body;
  const token = req.header("Authorization");

  if (!token) {
    return res
      .status(401)
      .json({ message: "Требуется токен для обновления тудулиста" });
  }

  try {
    const user = await User.findOne({ token: token });

    if (!user) {
      return res.status(401).json({ message: "Пользователь не авторизован" });
    }

    const todoList = await TodoList.findOne({
      email: user.email,
      todoid: todoid,
    });

    if (!todoList) {
      return res.status(404).json({ message: "Список задач не найден" });
    }

    todoList.name = name;

    await todoList.save();
    res.status(200).json({ message: "Тудулист успешно обновлен" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Маршрут для удаления тудулиста
app.delete("/todolists/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const token = req.header("Authorization");

  if (!token) {
    return res
      .status(401)
      .json({ message: "Требуется токен для удаления тудулиста" });
  }

  try {
    const user = await User.findOne({ token: token });

    if (!user) {
      return res.status(401).json({ message: "Пользователь не авторизован" });
    }

    const todoList = await TodoList.findOne({ email: user.email, todoid: id });

    if (!todoList) {
      return res.status(404).json({ message: "Список задач не найден" });
    }

    await TodoList.deleteOne({ email: user.email, todoid: id });
    res.status(200).json({ message: "Тудулист успешно удален" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Маршрут для получения списка задач для определенного тудулиста
app.get("/tasks/:todoid", authenticateToken, async (req, res) => {
  const { todoid } = req.params;
  const token = req.header("Authorization");

  if (!token) {
    return res
      .status(401)
      .json({ message: "Требуется токен для доступа к задачам" });
  }

  try {
    const user = await User.findOne({ token: token });

    if (!user) {
      return res.status(401).json({ message: "Пользователь не авторизован" });
    }

    const todoList = await TodoList.findOne({
      userid: user.id,
      todoid: todoid,
    });

    if (!todoList) {
      return res.status(404).json({ message: "Список задач не найден" });
    }

    const tasks = await Tasks.find({ todoid: todoid });

    res.json(tasks);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Маршрут для добавления новой задачи
app.post("/tasks/:todoid", authenticateToken, async (req, res) => {
  const { todoid } = req.params;
  const token = req.header("Authorization");
  const { taskid, name, checked } = req.body;

  if (!token) {
    return res
      .status(401)
      .json({ message: "Требуется токен для добавления задачи" });
  }

  try {
    const user = await User.findOne({ token: token });

    if (!user) {
      return res.status(401).json({ message: "Пользователь не авторизован" });
    }

    const todoList = await TodoList.findOne({
      email: user.email,
      todoid: todoid,
    });

    if (!todoList) {
      return res.status(404).json({ message: "Список задач не найден" });
    }

    const newTask = new Tasks({ taskid, name, checked });
    todoList.tasks.unshift(newTask);
    await todoList.save();

    res.status(201).json({ message: "Задача успешно добавлена" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Маршрут для обновления задачи
app.put("/tasks/:todoid/:taskid", authenticateToken, async (req, res) => {
  const { todoid, taskid } = req.params;
  const token = req.header("Authorization");
  const { name, checked } = req.body;

  if (!token) {
    return res
      .status(401)
      .json({ message: "Требуется токен для обновления задачи" });
  }

  try {
    const user = await User.findOne({ token: token });

    if (!user) {
      return res.status(401).json({ message: "Пользователь не авторизован" });
    }

    const todoList = await TodoList.findOne({
      email: user.email,
      todoid: todoid,
    });

    if (!todoList) {
      return res.status(404).json({ message: "Список задач не найден" });
    }

    const task = todoList.tasks.find((task) => task.taskid === taskid);

    if (!task) {
      return res.status(404).json({ message: "Задача не найдена" });
    }

    if (name) {
      task.name = name;
    }

    if (checked !== undefined) {
      task.checked = checked;
    }

    await todoList.save();

    res.status(200).json({ message: "Задача успешно обновлена" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Маршрут для удаления задачи
app.delete("/tasks/:todoid/:taskid", authenticateToken, async (req, res) => {
  const { todoid, taskid } = req.params;
  const token = req.header("Authorization");

  if (!token) {
    return res
      .status(401)
      .json({ message: "Требуется токен для удаления задачи" });
  }

  try {
    const user = await User.findOne({ token: token });

    if (!user) {
      return res.status(401).json({ message: "Пользователь не авторизован" });
    }

    const todoList = await TodoList.findOne({
      email: user.email,
      todoid: todoid,
    });

    if (!todoList) {
      return res.status(404).json({ message: "Список задач не найден" });
    }

    const taskIndex = todoList.tasks.findIndex(
      (task) => task.taskid === taskid
    );

    if (taskIndex === -1) {
      return res.status(404).json({ message: "Задача не найдена" });
    }

    todoList.tasks.splice(taskIndex, 1);

    await todoList.save();

    res.status(200).json({ message: "Задача успешно удалена" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
server.listen(4444, () => {
  console.log(`Server is running on port ${4444}`);
});
