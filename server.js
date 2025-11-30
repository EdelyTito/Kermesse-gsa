const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();

// Configurar CORS para producción
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

app.use(express.json());

// Configuración de PostgreSQL para Railway
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Función para inicializar la base de datos
async function inicializarBaseDeDatos() {
  try {
    console.log('🔄 Inicializando base de datos...');
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS platos (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        stock INTEGER NOT NULL,
        vendidos INTEGER DEFAULT 0,
        precio_costo DECIMAL(10,2),
        precio_venta DECIMAL(10,2)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ventas (
        id SERIAL PRIMARY KEY,
        equipo VARCHAR(50) NOT NULL,
        plato_id INTEGER REFERENCES platos(id),
        cantidad INTEGER NOT NULL,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const platosExistentes = await pool.query('SELECT COUNT(*) FROM platos');
    
    if (parseInt(platosExistentes.rows[0].count) === 0) {
      console.log('📝 Insertando platos iniciales...');
      await pool.query(`
        INSERT INTO platos (nombre, stock, precio_costo, precio_venta) VALUES
        ('Pollo al Horno', 65, 20, 35),
        ('Fricassé', 65, 18, 35),
        ('Chicharrón', 65, 22, 35);
      `);
      console.log('✅ Platos iniciales insertados');
    }

    console.log('✅ Base de datos lista');
  } catch (error) {
    console.error('❌ Error inicializando base de datos:', error);
  }
}

// Health check
app.get('/', (req, res) => {
  res.json({ 
    message: '🚀 Backend Kermesse Scout funcionando!',
    timestamp: new Date().toISOString()
  });
});

// Obtener platos
app.get('/api/platos', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM platos ORDER BY id');
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo platos:', error);
    res.status(500).json({ error: error.message });
  }
});

// Actualizar cantidad vendida de un plato (CRUD)
app.put('/api/platos/:id', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const { vendidos } = req.body;

    console.log(`🔄 Actualizando plato ${id} a ${vendidos} vendidos`);

    const plato = await client.query('SELECT * FROM platos WHERE id = $1', [id]);
    if (plato.rows.length === 0) {
      throw new Error('Plato no encontrado');
    }

    if (vendidos > plato.rows[0].stock) {
      throw new Error(`La cantidad vendida no puede exceder el stock de ${plato.rows[0].stock}`);
    }

    if (vendidos < 0) {
      throw new Error('La cantidad vendida no puede ser negativa');
    }

    await client.query(
      'UPDATE platos SET vendidos = $1 WHERE id = $2',
      [vendidos, id]
    );

    await client.query('DELETE FROM ventas WHERE plato_id = $1', [id]);

    await client.query('COMMIT');
    
    console.log(`✅ Plato ${id} actualizado a ${vendidos} vendidos`);
    
    res.json({ 
      success: true, 
      message: `✅ ${plato.rows[0].nombre} actualizado a ${vendidos} vendidos` 
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error actualizando plato:', error);
    res.status(400).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Registrar venta
app.post('/api/ventas', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const { equipo, cantidades } = req.body;

    for (const [platoId, cantidad] of Object.entries(cantidades)) {
      if (parseInt(cantidad) > 0) {
        const plato = await client.query(
          'SELECT stock, vendidos, nombre FROM platos WHERE id = $1 FOR UPDATE',
          [platoId]
        );

        if (plato.rows.length === 0) {
          throw new Error('Plato no encontrado');
        }

        const nuevoVendidos = plato.rows[0].vendidos + parseInt(cantidad);
        if (nuevoVendidos > plato.rows[0].stock) {
          throw new Error(`No hay suficiente stock de ${plato.rows[0].nombre}`);
        }

        await client.query(
          'UPDATE platos SET vendidos = $1 WHERE id = $2',
          [nuevoVendidos, platoId]
        );

        await client.query(
          'INSERT INTO ventas (equipo, plato_id, cantidad) VALUES ($1, $2, $3)',
          [equipo, platoId, cantidad]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, message: 'Venta registrada correctamente' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error registrando venta:', error);
    res.status(400).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Ventas por equipo
app.get('/api/ventas/equipos', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        v.equipo,
        p.nombre as plato_nombre,
        p.precio_venta,
        SUM(v.cantidad) as total_vendido
      FROM ventas v
      JOIN platos p ON v.plato_id = p.id
      GROUP BY v.equipo, p.nombre, p.precio_venta
      ORDER BY v.equipo
    `);

    const equipos = {
      'lobatos-rovers': { nombre: 'Lobatos/Rovers', vendidos: 0, total: 0, platos: [], meta: 70 },
      'exploradores': { nombre: 'Exploradores', vendidos: 0, total: 0, platos: [], meta: 50 },
      'pioneros': { nombre: 'Pioneros', vendidos: 0, total: 0, platos: [], meta: 50 },
      'comision': { nombre: 'Comisión Ejecutiva', vendidos: 0, total: 0, platos: [], meta: 25 }
    };

    result.rows.forEach(row => {
      const cantidad = parseInt(row.total_vendido);
      const precio = parseFloat(row.precio_venta);
      
      equipos[row.equipo].vendidos += cantidad;
      equipos[row.equipo].total += cantidad * precio;
      equipos[row.equipo].platos.push({
        nombre: row.plato_nombre,
        cantidad: cantidad
      });
    });

    res.json(equipos);
  } catch (error) {
    console.error('Error obteniendo ventas por equipo:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para resetear datos
app.post('/api/reset', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('🔄 Reseteando base de datos...');
    
    await client.query('DELETE FROM ventas');
    await client.query('UPDATE platos SET vendidos = 0');
    
    await client.query('COMMIT');
    
    console.log('✅ Base de datos reseteada exitosamente');
    
    res.json({ 
      success: true, 
      message: '✅ Todos los datos han sido reseteados a cero' 
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error reseteando datos:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
  await inicializarBaseDeDatos();
});