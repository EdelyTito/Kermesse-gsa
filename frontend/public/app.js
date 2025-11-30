const { createApp } = Vue;

let backendURL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:3000' 
    : 'https://kermesse-gsa.up.railway.app';

createApp({
    data() {
        return {
            vista: 'admin',
            platos: [],
            venta: {
                equipo: '',
                cantidades: {}
            },
            ventasPorEquipo: {},
            loading: false,
            backendURL: backendURL,
            estadoConexion: '🔄 Conectando...'
        }
    },
    computed: {
        totalRecaudado() {
            return this.platos.reduce((total, plato) => {
                return total + (plato.vendidos * plato.precio_venta);
            }, 0);
        },
        totalVendido() {
            return this.platos.reduce((total, plato) => total + plato.vendidos, 0);
        },
        totalGanancia() {
            return this.platos.reduce((total, plato) => {
                return total + ((plato.precio_venta - plato.precio_costo) * plato.vendidos);
            }, 0);
        }
    },
    async mounted() {
        console.log('🔗 Conectando a:', this.backendURL);
        await this.cargarDatos();
        setInterval(this.cargarDatos, 10000);
    },
    methods: {
        // MÉTODOS CRUD NUEVOS
        iniciarEdicion(plato) {
            if (!plato.nuevoVendidos && plato.nuevoVendidos !== 0) {
                plato.nuevoVendidos = plato.vendidos;
            }
            plato.editando = true;
        },

        cancelarEdicion(plato) {
            plato.editando = false;
            plato.nuevoVendidos = null;
        },

        async guardarCambios(plato) {
            if (plato.nuevoVendidos === null || plato.nuevoVendidos === '') {
                alert('❌ Por favor ingresa una cantidad válida');
                return;
            }

            const nuevosVendidos = parseInt(plato.nuevoVendidos);
            
            if (nuevosVendidos < 0 || nuevosVendidos > plato.stock) {
                alert(`❌ La cantidad debe estar entre 0 y ${plato.stock}`);
                return;
            }

            this.loading = true;
            try {
                const response = await fetch(`${this.backendURL}/api/platos/${plato.id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        vendidos: nuevosVendidos
                    })
                });

                const result = await response.json();

                if (response.ok) {
                    alert('✅ Cantidad actualizada correctamente');
                    plato.vendidos = nuevosVendidos;
                    plato.editando = false;
                    plato.nuevoVendidos = null;
                    await this.cargarDatos(); // Recargar todos los datos
                } else {
                    alert('❌ Error: ' + result.error);
                }
            } catch (error) {
                console.error('Error:', error);
                alert('❌ Error de conexión al servidor');
            } finally {
                this.loading = false;
            }
        },

        // MÉTODOS EXISTENTES
        async resetearDatos() {
            if (confirm('⚠️ ¿ESTÁS ABSOLUTAMENTE SEGURO?\n\nEsto borrará TODAS las ventas y reseteará todos los contadores a CERO.\n\n✅ Pollo al Horno: 65 disponibles\n✅ Fricassé: 65 disponibles  \n✅ Chicharrón: 65 disponibles\n\nEsta acción NO se puede deshacer.')) {
                this.loading = true;
                try {
                    const response = await fetch(`${this.backendURL}/api/reset`, {
                        method: 'POST'
                    });
                    
                    const result = await response.json();
                    
                    if (response.ok) {
                        alert('✅ ' + result.message);
                        await this.cargarDatos();
                    } else {
                        alert('❌ Error: ' + result.error);
                    }
                } catch (error) {
                    console.error('Error:', error);
                    alert('❌ Error de conexión al servidor');
                } finally {
                    this.loading = false;
                }
            }
        },

        async cargarDatos() {
            try {
                console.log('📡 Cargando datos de:', this.backendURL);
                
                const [platosRes, ventasRes] = await Promise.all([
                    fetch(`${this.backendURL}/api/platos`),
                    fetch(`${this.backendURL}/api/ventas/equipos`)
                ]);
                
                console.log('📊 Respuesta platos:', platosRes.status);
                console.log('📊 Respuesta ventas:', ventasRes.status);
                
                if (platosRes.ok && ventasRes.ok) {
                    this.platos = await platosRes.json();
                    this.ventasPorEquipo = await ventasRes.json();
                    this.estadoConexion = '✅ Conectado - Datos en tiempo real';
                    console.log('✅ Datos cargados correctamente');
                    
                    // Inicializar propiedades para el CRUD
                    this.platos.forEach(plato => {
                        plato.editando = false;
                        plato.nuevoVendidos = null;
                    });
                } else {
                    throw new Error(`Platos: ${platosRes.status}, Ventas: ${ventasRes.status}`);
                }
                
            } catch (error) {
                console.error('❌ Error cargando datos:', error);
                this.estadoConexion = '❌ Error de conexión';
            }
            
            // Inicializar cantidades para ventas
            this.platos.forEach(plato => {
                if (this.venta.cantidades[plato.id] === undefined) {
                    this.venta.cantidades[plato.id] = 0;
                }
            });
        },
        
        async registrarVenta() {
            const totalVendido = Object.values(this.venta.cantidades).reduce((a, b) => a + b, 0);
            
            if (totalVendido === 0) {
                alert('❌ Debes vender al menos un plato');
                return;
            }
            
            if (!this.venta.equipo) {
                alert('❌ Debes seleccionar un equipo');
                return;
            }

            this.loading = true;

            try {
                const response = await fetch(`${this.backendURL}/api/ventas`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(this.venta)
                });

                const result = await response.json();

                if (response.ok) {
                    alert('✅ Venta registrada exitosamente!');
                    Object.keys(this.venta.cantidades).forEach(key => {
                        this.venta.cantidades[key] = 0;
                    });
                    this.venta.equipo = '';
                    await this.cargarDatos();
                } else {
                    alert(`❌ Error: ${result.error}`);
                }
            } catch (error) {
                console.error('Error:', error);
                alert('❌ Error de conexión con el servidor');
            } finally {
                this.loading = false;
            }
        }
    }
}).mount('#app');