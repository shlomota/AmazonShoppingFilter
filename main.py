import os
from openai import OpenAI
from bs4 import BeautifulSoup
from pydantic import BaseModel
from typing import List

class Product(BaseModel):
    name: str
    relevant: bool

class ProductList(BaseModel):
    products: List[Product]

def extract_products(html_file):
    with open(html_file, 'r', encoding='utf-8') as file:
        soup = BeautifulSoup(file, 'html.parser')

    products = []
    results = soup.select("div.s-result-item[data-component-type='s-search-result']")

    for result in results:
        title = result.select_one("h2 span")

        if title:
            product = {
                "name": title.get_text(strip=True),
                "element": result  # Store the entire HTML element for filtering
            }
            products.append(product)

    return products

def filter_products_with_llm(products, criteria):
    client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

    prompt = f"""
    You are a product filtering assistant. Your task is to evaluate the relevance of each product based on the user's criteria: "{criteria}".
    For each product, carefully consider all details, including suitability for adults, type of sled (not tube), and any other criteria. 

    Only mark a product as 'relevant: true' if it satisfies **all criteria completely**. If there is any ambiguity or missing information about a criterion, mark the product as 'relevant: false'.

    Respond with a JSON array where each item contains:
    - 'name': the product name
    - 'relevant': a boolean indicating if the product is relevant

    Example Input:
    Products:
    [
        {{ "name": "Snow Sled for Kid and Adult Includes Resistant Handles and Ropes" }},
        {{ "name": "Tube for Kids Sledding" }},
        {{ "name": "Tube for Adults with Handles" }}
    ]

    Example Output:
    [
        {{ "name": "Snow Sled for Kid and Adult Includes Resistant Handles and Ropes", "relevant": true }},
        {{ "name": "Tube for Kids Sledding", "relevant": false }},
        {{ "name": "Tube for Adults with Handles", "relevant": false }}
    ]

    Now, analyze the following products:
    Products:
    {[{'name': product['name']} for product in products[:10]]}
    """

    response = client.beta.chat.completions.parse(
        model="gpt-4o-2024-08-06",
        messages=[
            {"role": "user", "content": prompt}
        ],
        response_format=ProductList,  # Use the explicitly defined wrapper model
    )

    return response.choices[0].message.parsed.products  # Extract the list from the wrapper

def generate_filtered_html(original_html_file, filtered_products, output_file):
    with open(original_html_file, 'r', encoding='utf-8') as file:
        soup = BeautifulSoup(file, 'html.parser')

    # Create a set of names for relevant products
    filtered_names = {product.name for product in filtered_products if product.relevant}

    # Remove all items not in the filtered list
    for result in soup.select("div.s-result-item[data-component-type='s-search-result']"):
        title = result.select_one("h2 span")
        if title and title.get_text(strip=True) not in filtered_names:
            result.decompose()

    with open(output_file, 'w', encoding='utf-8') as file:
        file.write(soup.prettify())

if __name__ == "__main__":
    html_file = "Amazon.com _ sled.html"
    output_file = "filtered_results.html"
    filter_criteria = "hard plastic and for adults"

    products = extract_products(html_file)

    if not products:
        print("No products found. Please check the HTML file and selectors.")
    else:
        filtered_products = filter_products_with_llm(products, filter_criteria)
        generate_filtered_html(html_file, filtered_products, output_file)

        print(f"Filtered results saved to {output_file}")
