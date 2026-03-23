package sse

import (
	"encoding/json"
	"fmt"
	"sync"
)

type Event struct {
	Type    string      `json:"type"`
	Payload any `json:"payload"`
}

type Client struct {
	ID      string
	Project string
	Ch      chan string
}

type Broker struct {
	mu      sync.RWMutex
	clients map[string]*Client
}

func NewBroker() *Broker {
	return &Broker{clients: make(map[string]*Client)}
}

func (b *Broker) Subscribe(id, project string) *Client {
	c := &Client{ID: id, Project: project, Ch: make(chan string, 10)}
	b.mu.Lock()
	b.clients[id] = c
	b.mu.Unlock()
	return c
}

func (b *Broker) Unsubscribe(id string) {
	b.mu.Lock()
	if c, ok := b.clients[id]; ok {
		close(c.Ch)
		delete(b.clients, id)
	}
	b.mu.Unlock()
}

func (b *Broker) Broadcast(eventType string, payload any, project string) {
	data, _ := json.Marshal(Event{Type: eventType, Payload: payload})
	msg := fmt.Sprintf("data: %s\n\n", data)
	b.mu.RLock()
	defer b.mu.RUnlock()
	for _, c := range b.clients {
		if project == "" || c.Project == "" || c.Project == project {
			select {
			case c.Ch <- msg:
			default:
			}
		}
	}
}
