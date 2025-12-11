import postgres from 'postgres'
import {
  CustomerField,
  CustomersTableType,
  InvoiceForm,
  InvoicesTable,
  LatestInvoiceRaw,
  Revenue
} from './definitions'
import { formatCurrency } from './utils'
import { unstable_noStore as noStore } from 'next/cache'

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' })

/**
 * 获取收入数据的异步函数
 * 该函数从数据库中查询收入信息并返回结果
 * @returns {Promise<Revenue[]>} 返回一个包含收入数据的Promise对象
 */
export async function fetchRevenue() {
  // noStore()
  try {
    // Artificially delay a response for demo purposes.
    // Don't do this in production :)

    // 人为延迟响应，仅用于演示目的
    // 在生产环境中请勿这样做 :)
    // console.log('Fetching revenue data...');
    // console.log('正在获取收入数据...')
    // await new Promise((resolve) => setTimeout(resolve, 3000))

    // 等待3秒，仅用于演示
    const data = await sql<Revenue[]>`SELECT * FROM revenue`

    // 从revenue表中查询所有数据
    // 使用SQL模板查询获取收入数据
    // console.log('Data fetch completed after 3 seconds.')

    // console.log('数据获取完成，耗时3秒。');
    return data
    // 返回查询到的收入数据
  } catch (error) {
    console.error('Database Error:', error)
    // 在控制台输出数据库错误信息
    throw new Error('Failed to fetch revenue data.')
    // 抛出获取收入数据失败的错误
  }
}

/**
 * 获取最新的发票数据
 * 该函数从数据库中查询最新的5条发票记录，并格式化金额字段
 * @returns {Promise<Array>} 返回包含最新发票信息的数组，每个发票包含格式化后的金额
 */
export async function fetchLatestInvoices() {
  try {
    // 使用SQL查询获取最新的5条发票记录
    // 查询字段包括发票金额、客户名称、客户头像URL、客户邮箱和发票ID
    const data = await sql<LatestInvoiceRaw[]>`
      SELECT invoices.amount, customers.name, customers.image_url, customers.email, invoices.id
      FROM invoices
      JOIN customers ON invoices.customer_id = customers.id
      ORDER BY invoices.date DESC
      LIMIT 5`

    // 遍历查询结果，将金额字段格式化为货币格式
    const latestInvoices = data.map((invoice) => ({
      ...invoice,
      amount: formatCurrency(invoice.amount)
    }))
    return latestInvoices
  } catch (error) {
    // 捕获并处理数据库错误
    console.error('Database Error:', error)
    throw new Error('Failed to fetch the latest invoices.')
  }
}

export async function fetchCardData() {
  try {
    // You can probably combine these into a single SQL query
    // However, we are intentionally splitting them to demonstrate
    // how to initialize multiple queries in parallel with JS.
    const invoiceCountPromise = sql`SELECT COUNT(*) FROM invoices`
    const customerCountPromise = sql`SELECT COUNT(*) FROM customers`
    const invoiceStatusPromise = sql`SELECT
         SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) AS "paid",
         SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) AS "pending"
         FROM invoices`

    const data = await Promise.all([
      invoiceCountPromise,
      customerCountPromise,
      invoiceStatusPromise
    ])

    const numberOfInvoices = Number(data[0][0].count ?? '0')
    const numberOfCustomers = Number(data[1][0].count ?? '0')
    const totalPaidInvoices = formatCurrency(data[2][0].paid ?? '0')
    const totalPendingInvoices = formatCurrency(data[2][0].pending ?? '0')

    return {
      numberOfCustomers,
      numberOfInvoices,
      totalPaidInvoices,
      totalPendingInvoices
    }
  } catch (error) {
    console.error('Database Error:', error)
    throw new Error('Failed to fetch card data.')
  }
}

const ITEMS_PER_PAGE = 6
export async function fetchFilteredInvoices(
  query: string,
  currentPage: number
) {
  const offset = (currentPage - 1) * ITEMS_PER_PAGE

  try {
    const invoices = await sql<InvoicesTable[]>`
      SELECT
        invoices.id,
        invoices.amount,
        invoices.date,
        invoices.status,
        customers.name,
        customers.email,
        customers.image_url
      FROM invoices
      JOIN customers ON invoices.customer_id = customers.id
      WHERE
        customers.name ILIKE ${`%${query}%`} OR
        customers.email ILIKE ${`%${query}%`} OR
        invoices.amount::text ILIKE ${`%${query}%`} OR
        invoices.date::text ILIKE ${`%${query}%`} OR
        invoices.status ILIKE ${`%${query}%`}
      ORDER BY invoices.date DESC
      LIMIT ${ITEMS_PER_PAGE} OFFSET ${offset}
    `

    return invoices
  } catch (error) {
    console.error('Database Error:', error)
    throw new Error('Failed to fetch invoices.')
  }
}

export async function fetchInvoicesPages(query: string) {
  try {
    const data = await sql`SELECT COUNT(*)
    FROM invoices
    JOIN customers ON invoices.customer_id = customers.id
    WHERE
      customers.name ILIKE ${`%${query}%`} OR
      customers.email ILIKE ${`%${query}%`} OR
      invoices.amount::text ILIKE ${`%${query}%`} OR
      invoices.date::text ILIKE ${`%${query}%`} OR
      invoices.status ILIKE ${`%${query}%`}
  `

    const totalPages = Math.ceil(Number(data[0].count) / ITEMS_PER_PAGE)
    return totalPages
  } catch (error) {
    console.error('Database Error:', error)
    throw new Error('Failed to fetch total number of invoices.')
  }
}

export async function fetchInvoiceById(id: string) {
  try {
    const data = await sql<InvoiceForm[]>`
      SELECT
        invoices.id,
        invoices.customer_id,
        invoices.amount,
        invoices.status
      FROM invoices
      WHERE invoices.id = ${id};
    `

    const invoice = data.map((invoice) => ({
      ...invoice,
      // Convert amount from cents to dollars
      amount: invoice.amount / 100
    }))

    return invoice[0]
  } catch (error) {
    console.error('Database Error:', error)
    throw new Error('Failed to fetch invoice.')
  }
}

export async function fetchCustomers() {
  try {
    const customers = await sql<CustomerField[]>`
      SELECT
        id,
        name
      FROM customers
      ORDER BY name ASC
    `

    return customers
  } catch (err) {
    console.error('Database Error:', err)
    throw new Error('Failed to fetch all customers.')
  }
}

export async function fetchFilteredCustomers(query: string) {
  try {
    const data = await sql<CustomersTableType[]>`
		SELECT
		  customers.id,
		  customers.name,
		  customers.email,
		  customers.image_url,
		  COUNT(invoices.id) AS total_invoices,
		  SUM(CASE WHEN invoices.status = 'pending' THEN invoices.amount ELSE 0 END) AS total_pending,
		  SUM(CASE WHEN invoices.status = 'paid' THEN invoices.amount ELSE 0 END) AS total_paid
		FROM customers
		LEFT JOIN invoices ON customers.id = invoices.customer_id
		WHERE
		  customers.name ILIKE ${`%${query}%`} OR
        customers.email ILIKE ${`%${query}%`}
		GROUP BY customers.id, customers.name, customers.email, customers.image_url
		ORDER BY customers.name ASC
	  `

    const customers = data.map((customer) => ({
      ...customer,
      total_pending: formatCurrency(customer.total_pending),
      total_paid: formatCurrency(customer.total_paid)
    }))

    return customers
  } catch (err) {
    console.error('Database Error:', err)
    throw new Error('Failed to fetch customer table.')
  }
}
