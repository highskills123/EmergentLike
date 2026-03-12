import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Chat from './components/Chat.jsx';
import Home from './pages/Home.jsx';
import Task from './pages/Task.jsx';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/tasks/:id" element={<Task />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

