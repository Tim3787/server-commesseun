# Usa un'immagine di Node.js come base
FROM node:14

# Imposta la cartella di lavoro
WORKDIR /app

# Copia i file del progetto nel container
COPY package*.json ./

# Installa le dipendenze
RUN npm install

# Copia il resto del codice
COPY . .

# Espone la porta su cui l'app gira
EXPOSE 5000

# Comando per avviare l'app
CMD ["npm", "start"]
