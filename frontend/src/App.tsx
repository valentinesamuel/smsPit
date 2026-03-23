import { useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Inbox } from './pages/Inbox'
import { MessageDetail } from './pages/MessageDetail'
import { DeadLetters } from './pages/DeadLetters'
import { QueryRunner } from './pages/QueryRunner'
import { Projects } from './pages/Projects'

export default function App() {
  const [project, setProject] = useState<string | null>(null)
  const [projects] = useState<{ name: string }[]>([])

  return (
    <BrowserRouter>
      <Layout project={project} onProjectChange={setProject}>
        <Routes>
          <Route path="/" element={<Inbox project={project} onProjectChange={setProject} projects={projects} />} />
          <Route path="/messages/:id" element={<MessageDetail />} />
          <Route path="/dead-letters" element={<DeadLetters project={project} />} />
          <Route path="/query" element={<QueryRunner />} />
          <Route path="/projects" element={<Projects />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}
