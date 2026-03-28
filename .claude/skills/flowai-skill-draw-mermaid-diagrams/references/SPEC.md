# Mermaid.js Syntax Specification

## 1. Flowcharts

A flowchart is a type of diagram that represents an algorithm, workflow or process.

### 1.1 Graph Directions

- `TB` - top bottom
- `BT` - bottom top
- `RL` - right left
- `LR` - left right
- `TD` - same as TB

Example:

```mermaid
graph TD;
    A-->B;
    A-->C;
    B-->D;
    C-->D;
```

### 1.2 Nodes & Shapes

- `id` - Default box
- `id1[Text]` - Rectangle with text
- `id1(Text)` - Rounded edges
- `id1((Text))` - Circle
- `id1>Text]` - Asymmetric shape
- `id1{Text}` - Rhombus (Decision)

### 1.3 Links

- `A-->B` - Arrow head
- `A---B` - Open link
- `A-- Text ---B` - Text on link
- `A---|Text|B` - Text on link
- `A-->|Text|B` - Link with arrow and text
- `A-- Text -->B` - Link with arrow and text
- `A-.->B` - Dotted link
- `A-. Text .->B` - Dotted link with text
- `A==>B` - Thick link
- `A== Text ==>B` - Thick link with text

### 1.4 Subgraphs

```mermaid
graph TB
    c1-->a2
    subgraph one
    a1-->a2
    end
    subgraph two
    b1-->b2
    end
    subgraph three
    c1-->c2
    end
```

## 2. Sequence Diagrams

A Sequence diagram is an interaction diagram that shows how processes operate with one another and in what order.

### 2.1 Participants

```mermaid
sequenceDiagram
    participant Alice
    participant John
    Alice->>John: Hello John, how are you?
    John-->>Alice: Great!
```

### 2.2 Aliases

```mermaid
sequenceDiagram
    participant A as Alice
    participant J as John
    A->>J: Hello John, how are you?
    J-->>A: Great!
```

### 2.3 Messages

- `->` Solid line without arrow
- `-->` Dotted line without arrow
- `->>` Solid line with arrowhead
- `-->>` Dotted line with arrowhead
- `-x` Solid line with a cross at the end (async)
- `--x` Dotted line with a cross at the end (async)

### 2.4 Activations

```mermaid
sequenceDiagram
    Alice->>John: Hello John, how are you?
    activate John
    John-->>Alice: Great!
    deactivate John
```

Shortcut: `Alice->>+John: Hello` and `John-->>-Alice: Great!`

### 2.5 Notes

`Note [ right of | left of | over ] [Actor]: Text`

### 2.6 Loops

```mermaid
sequenceDiagram
    Alice->John: Hello
    loop Every minute
        John-->Alice: Great!
    end
```

### 2.7 Alt (Alternative paths)

```mermaid
sequenceDiagram
    Alice->>John: Hello
    alt is sick
        John->>Alice: Not so good
    else is well
        John->>Alice: Feeling fresh
    end
    opt Extra response
        John->>Alice: Thanks
    end
```

## 3. Gantt Diagrams

```mermaid
gantt
    title A Gantt Diagram
    dateFormat YYYY-MM-DD
    section Section
    First Task :a1, 2018-07-01, 30d
    Another Task :after a1, 20d
    section Another
    Second Task :2018-07-12, 12d
    Third Task : 24d
```

## 4. Class Diagrams

```mermaid
classDiagram
    Class01 <|-- AveryLongClass : Cool
    Class03 *-- Class04
    Class05 o-- Class06
    Class07 .. Class08
    Class09 --> C2 : Where am i?
    Class09 --* C3
    Class09 --|> Class07
    Class07 : equals()
    Class07 : Object[] elementData
    Class01 : size()
    Class01 : int chimp
    Class01 : int gorilla
    Class08 <--> C2: Cool label
```

## 5. State Diagrams

```mermaid
stateDiagram-v2
    [*] --> Still
    Still --> [*]
    Still --> Moving
    Moving --> Still
    Moving --> Crash
    Crash --> [*]
```

## 6. Entity Relationship Diagrams

```mermaid
erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE-ITEM : contains
    CUSTOMER }|..|{ DELIVERY-ADDRESS : uses
```

## 7. User Journey

```mermaid
journey
    title My working day
    section Go to work
      Make tea: 5: Me
      Go upstairs: 3: Me
      Do work: 1: Me, Cat
    section Go home
      Go downstairs: 5: Me
      Sit down: 5: Me
```

## 8. Pie Chart

```mermaid
pie title Pets adopted by volunteers
    "Dogs" : 386
    "Cats" : 85
    "Rats" : 15
```
